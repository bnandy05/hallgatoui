import { ImageResponse } from "next/og";
import { ICON_COLORS, THEME_COLOR } from "@/lib/theme";

/** The logo mark (a paper slip with a red pin on felt), drawn at any square size. `pad` keeps it clear of maskable crops. */
export function appIcon(size: number, pad = 0.2): ImageResponse {
  const inner = size * (1 - pad * 2);
  const paperW = inner * 0.62;
  const paperH = inner * 0.76;
  const pin = inner * 0.2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: THEME_COLOR.light,
        }}
      >
        <div style={{ position: "relative", display: "flex", width: paperW, height: paperH }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              top: pin * 0.5,
              background: ICON_COLORS.paper,
              borderRadius: size * 0.02,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: (paperW - pin) / 2,
              top: 0,
              width: pin,
              height: pin,
              borderRadius: 9999,
              background: ICON_COLORS.pin,
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
