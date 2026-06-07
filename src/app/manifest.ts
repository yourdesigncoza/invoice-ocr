import type { MetadataRoute } from "next";

// PWA manifest — makes the app installable to the phone home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpendSilo — Supplier Spend Intelligence",
    short_name: "SpendSilo",
    description:
      "Snap a photo of an invoice or receipt and turn it into clean, reviewed supplier spend data.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC",
    theme_color: "#0F172A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
