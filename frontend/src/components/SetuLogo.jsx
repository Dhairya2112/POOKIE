export function SetuLogo({ size = 24, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient
          id="setu-logo-grad"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8052ff" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      {/* Infinite loop/bridge design representing Setu */}
      <path
        d="M3 12C3 8.13401 6.13401 5 10 5C12.3978 5 14.5422 6.20235 15.8284 8.0384C17.1146 9.87445 19.259 11.0768 21.6569 11.0768"
        stroke="url(#setu-logo-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M21 12C21 15.866 17.866 19 14 19C11.6022 19 9.4578 17.7976 8.17157 15.9616C6.88537 14.1256 4.741 12.9232 2.34315 12.9232"
        stroke="url(#setu-logo-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="5" r="1.5" fill="#c084fc" />
      <circle cx="14" cy="19" r="1.5" fill="#8052ff" />
    </svg>
  );
}
