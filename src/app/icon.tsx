import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: 32, height: 32, background: "#04110c", color: "#7ddec4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 650 }}>T</div>,
    size,
  );
}
