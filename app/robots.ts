import type { MetadataRoute } from "next";

// Public pages may be indexed; the app itself and the API are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/fiok", "/hirlevel", "/beallitasok", "/targy", "/radar"],
    },
  };
}
