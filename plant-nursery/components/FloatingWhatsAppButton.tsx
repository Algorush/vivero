"use client";

import { useEffect, useState } from "react";

type FloatingWhatsAppButtonProps = {
  href: string;
};

export default function FloatingWhatsAppButton({
  href,
}: FloatingWhatsAppButtonProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const heroSection = document.getElementById("home-hero");

    const onScroll = () => {
      const threshold = heroSection
        ? Math.max(heroSection.offsetHeight - 120, 220)
        : 220;

      setIsVisible(window.scrollY > threshold);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Escribir por WhatsApp"
      className={[
        "fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full",
        "bg-[#25D366] text-white shadow-[0_14px_28px_rgba(10,80,38,0.35)]",
        "transition-all duration-300 hover:scale-105 hover:shadow-[0_18px_36px_rgba(10,80,38,0.42)]",
        isVisible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-5 opacity-0",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        width="30"
        height="30"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.05 4.94A9.94 9.94 0 0 0 12 2a9.96 9.96 0 0 0-8.67 14.88L2 22l5.27-1.3A9.96 9.96 0 1 0 19.05 4.94ZM12 20.2a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.13.77.84-3.05-.2-.32A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.25-.12-1.45-.71-1.68-.8-.23-.08-.4-.12-.57.12-.16.25-.65.8-.8.96-.14.17-.3.18-.56.06-.25-.12-1.08-.4-2.05-1.28-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.38.1-.5.1-.1.25-.26.37-.39.12-.14.17-.24.25-.4.08-.17.04-.3-.02-.43-.06-.12-.57-1.37-.78-1.87-.2-.49-.4-.42-.57-.43h-.49a.95.95 0 0 0-.68.32c-.24.25-.92.9-.92 2.2 0 1.3.95 2.55 1.08 2.73.12.17 1.86 2.86 4.5 4 .63.27 1.13.43 1.52.55.64.2 1.22.17 1.68.1.52-.08 1.45-.6 1.66-1.18.2-.58.2-1.08.14-1.18-.05-.1-.22-.16-.47-.28Z" />
      </svg>
    </a>
  );
}
