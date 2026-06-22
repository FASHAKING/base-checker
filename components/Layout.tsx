interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function Layout({ children, title = "Base Airdrop Checker" }: LayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #e5e7eb",
          padding: "0.75rem 0",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            margin: "0 auto",
            padding: "0 1rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(1.1rem, 4vw, 1.3rem)",
              fontWeight: 600,
              color: "#1a1a1a",
            }}
          >
            {title}
          </h1>
        </div>
      </div>

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "1.5rem 1rem",
          flex: 1,
          width: "100%",
        }}
      >
        {children}
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "1rem",
          borderTop: "1px solid #e5e7eb",
          marginTop: "auto",
          fontSize: "0.75rem",
          color: "#9ca3af",
        }}
      >
        Base Airdrop Checker — scoring rubric blended from ARB, OP, ZK, ZRO airdrops
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: "0.78rem",
            color: "#6b7280",
          }}
        >
          <span>Built with</span>
          <span style={{ color: "#ef4444" }}>❤️</span>
          <span>for the Base community by</span>
          <a
            href="https://x.com/fashaking3"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#1a1a1a",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <img
              src="/fashaking.png"
              alt=""
              width={22}
              height={22}
              style={{ borderRadius: "50%", border: "1px solid #e5e7eb" }}
            />
            <span>fashaking</span>
          </a>
        </div>
      </div>
    </div>
  );
}
