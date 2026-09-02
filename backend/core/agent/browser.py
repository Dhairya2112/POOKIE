import asyncio
import logging
import threading
import time

from playwright.async_api import async_playwright

logger = logging.getLogger("core.agent.browser")

class BrowserManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if not cls._instance:
                cls._instance = super(BrowserManager, cls).__new__(cls)
                cls._instance._init_manager()
            return cls._instance

    def _init_manager(self):
        self.loop = None
        self.loop_thread = None
        self.playwright = None
        self.sessions = {}  # user_id -> { "browser": ..., "context": ..., "page": ..., "last_accessed": ... }
        self.running = True

        # Start the dedicated event loop thread
        import platform
        if platform.system() == "Windows":
            self.loop = asyncio.ProactorEventLoop()
        else:
            self.loop = asyncio.new_event_loop()
        self.loop_thread = threading.Thread(target=self._run_loop, daemon=True, name="SetuPlaywrightLoop")
        self.loop_thread.start()

        # Run setup on the loop
        future = asyncio.run_coroutine_threadsafe(self._setup_playwright(), self.loop)
        future.result()  # Wait for initialization to complete

        # Start the inactivity checker thread
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True, name="SetuPlaywrightCleanup")
        self.cleanup_thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    async def _setup_playwright(self):
        self.playwright = await async_playwright().start()
        import os
        headless = os.getenv("PLAYWRIGHT_HEADLESS", "False").lower() == "true"
        self.browser = await self.playwright.chromium.launch(
            headless=headless, 
            slow_mo=300,
            args=['--start-maximized', '--window-position=0,0']
        )

    def _cleanup_loop(self):
        while self.running:
            time.sleep(30)
            now = time.time()
            users_to_close = []
            for user_id, session in list(self.sessions.items()):
                if now - session["last_accessed"] > 300:  # 5 minutes of inactivity
                    users_to_close.append(user_id)
            
            for user_id in users_to_close:
                logger.info("Closing inactive browser session for user %s", user_id)
                self.close_session(user_id)

    async def _get_page_async(self, user_id: str):
        now = time.time()
        if user_id in self.sessions:
            session = self.sessions[user_id]
            session["last_accessed"] = now
            try:
                page = session["page"]
                if not page.is_closed():
                    return page
            except Exception as e:
                logger.warning("Failed to reuse session page: %s", e)
            
            # Recreate session if broken
            await self._close_session_async(user_id)

        logger.info("Launching new browser context for user %s", user_id)
        context = await self.browser.new_context(
            no_viewport=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        await page.bring_to_front()

        self.sessions[user_id] = {
            "context": context,
            "page": page,
            "last_accessed": now
        }
        return page

    async def _close_session_async(self, user_id: str):
        session = self.sessions.pop(user_id, None)
        if session:
            try:
                await session["page"].close()
            except Exception:
                pass
            try:
                await session["context"].close()
            except Exception:
                pass

    def get_page(self, user_id: str):
        """Submit page retrieval to the event loop thread and wait for result."""
        coro = self._get_page_async(user_id)
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result()

    def close_session(self, user_id: str):
        coro = self._close_session_async(user_id)
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            import concurrent.futures
            future.result(timeout=5.0)
        except concurrent.futures.TimeoutError:
            logger.warning("Timeout closing session for user %s. Proceeding anyway.", user_id)
        except Exception as e:
            logger.error("Error closing session for user %s: %s", user_id, e)

    async def _shutdown_async(self):
        for user_id in list(self.sessions.keys()):
            await self._close_session_async(user_id)
        if hasattr(self, 'browser') and self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

    def shutdown(self):
        self.running = False
        coro = self._shutdown_async()
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        future.result()
        self.loop.call_soon_threadsafe(self.loop.stop)

    # ── High Level Actions executed on the Playwright Loop Thread ──

    def navigate(self, user_id: str, url: str) -> str:
        async def _action():
            page = await self._get_page_async(user_id)
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Short settle delay for JS frameworks
            await asyncio.sleep(0.3)
            return f"Successfully navigated to {page.url}"
        
        try:
            future = asyncio.run_coroutine_threadsafe(_action(), self.loop)
            return future.result()
        except Exception as e:
            return f"Error navigating to {url}: {str(e)}"

    def read_screen(self, user_id: str) -> dict:
        async def _action():
            page = await self._get_page_async(user_id)
            js_script = """
            () => {
                let generationId = Date.now().toString();
                window.__setu_generation = generationId;
                
                // Recursively pierce Shadow DOMs
                function getAllElements(root) {
                    let elements = [];
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                    let node;
                    while (node = walker.nextNode()) {
                        elements.push(node);
                        if (node.shadowRoot) {
                            elements = elements.concat(getAllElements(node.shadowRoot));
                        }
                    }
                    return elements;
                }
                
                let allNodes = getAllElements(document);
                let interactiveTags = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'];
                let elements = allNodes.filter(el => 
                    interactiveTags.includes(el.tagName) || 
                    el.getAttribute('role') === 'button' || 
                    el.getAttribute('role') === 'link' || 
                    el.hasAttribute('tabindex')
                );
                
                let map = [];
                let idCounter = 1;
                
                elements.forEach(el => {
                    let rect = el.getBoundingClientRect();
                    // Verify visibility
                    if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).opacity !== '0') {
                        el.setAttribute('setu-id', idCounter);
                        
                        let text = el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.name || 'unnamed';
                        text = text.substring(0, 60).replace(/\\n/g, ' ').trim();
                        
                        let tag = el.tagName.toLowerCase();
                        if (el.getAttribute('type')) tag += `[type="${el.getAttribute('type')}"]`;
                        
                        map.push(`[ID: ${idCounter}] ${tag}: "${text}"`);
                        idCounter++;
                    }
                });
                
                return {
                    "generation_id": generationId,
                    "elements": map,
                    "url": window.location.href,
                    "title": document.title
                };
            }
            """
            result = await page.evaluate(js_script)
            return result

        try:
            future = asyncio.run_coroutine_threadsafe(_action(), self.loop)
            return future.result()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def click_element(self, user_id: str, element_id: int, generation_id: str) -> dict:
        async def _action():
            page = await self._get_page_async(user_id)
            
            # Stale Element Check
            current_gen = await page.evaluate("window.__setu_generation")
            if str(current_gen) != str(generation_id):
                return {"status": "stale_id", "message": f"DOM updated. Generation mismatch (Expected: {generation_id}, Found: {current_gen}). Please call read_screen() again."}
            
            loc = page.locator(f"[setu-id='{element_id}']")
            if await loc.count() == 0:
                return {"status": "error", "message": f"Element ID {element_id} not found on the page."}
                
            await loc.first.click(timeout=5000)
            await page.wait_for_load_state("domcontentloaded")
            await asyncio.sleep(0.3)
            return {"status": "success", "message": f"Clicked element {element_id}."}

        try:
            future = asyncio.run_coroutine_threadsafe(_action(), self.loop)
            return future.result()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def type_element(self, user_id: str, element_id: int, text: str, generation_id: str, press_enter: bool = False) -> dict:
        async def _action():
            page = await self._get_page_async(user_id)
            
            # Stale Element Check
            current_gen = await page.evaluate("window.__setu_generation")
            if str(current_gen) != str(generation_id):
                return {"status": "stale_id", "message": f"DOM updated. Generation mismatch. Please call read_screen() again."}
            
            loc = page.locator(f"[setu-id='{element_id}']")
            if await loc.count() == 0:
                return {"status": "error", "message": f"Element ID {element_id} not found on the page."}
                
            await loc.first.fill(text, timeout=5000)
            if press_enter:
                await loc.first.press("Enter", timeout=5000)
                await page.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(0.3)
                return {"status": "success", "message": f"Typed text into element {element_id} and pressed Enter."}
            return {"status": "success", "message": f"Typed text into element {element_id}."}

        try:
            future = asyncio.run_coroutine_threadsafe(_action(), self.loop)
            return future.result()
        except Exception as e:
            return {"status": "error", "message": str(e)}

