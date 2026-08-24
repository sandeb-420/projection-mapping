import type { Mapping } from "../lib/pipeline/mapping";
import { fitSceneTopDown } from "../lib/calib/sceneSketch";

export function SceneSketch(props: {
  mapping: Mapping;
  poseSource: string | null;
  projectorSource?: string | null;
}) {
  const { mapping, poseSource, projectorSource } = props;
  const sketch = fitSceneTopDown(mapping, 320, 180);
  const assumed = poseSource === "station-layout";

  return (
    <div>
      <svg
        className="sketch"
        viewBox={`0 0 ${sketch.width} ${sketch.height}`}
        role="img"
        aria-label="Top-down recovered projector, phones, and mapped surfaces"
      >
        {sketch.marks
          .filter((m) => m.kind === "point")
          .map((m) => (
            <circle key={m.id} cx={m.x} cy={m.y} r={1.4} fill="#5a635c" />
          ))}
        {sketch.phones.map((m) => (
          <g key={m.id}>
            <circle cx={m.x} cy={m.y} r={4} fill="#6fd7c8" />
            <text x={m.x + 6} y={m.y + 3} fill="#8b948c" fontSize="8">
              {m.id}
            </text>
          </g>
        ))}
        {sketch.projector ? (
          <g>
            <polygon
              points={`${sketch.projector.x},${sketch.projector.y - 6} ${sketch.projector.x - 5},${sketch.projector.y + 5} ${sketch.projector.x + 5},${sketch.projector.y + 5}`}
              fill="#d7a24a"
            />
            <text
              x={sketch.projector.x + 8}
              y={sketch.projector.y + 4}
              fill="#d7a24a"
              fontSize="8"
            >
              projector
            </text>
          </g>
        ) : null}
      </svg>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        Top-down 3D: gold triangle is the recovered projector, cyan dots are phone
        stations, gray is mapped surfaces. Looks are warped in this frame, not by
        dragging a grid.
        {assumed
          ? " Phone poses are the assumed walk (center/left/right) until DA3/MoGe is on. Projector pose is still solved from the stripes."
          : poseSource
            ? ` Phone poses from ${poseSource}.`
            : ""}
        {projectorSource === "opencv-pnp"
          ? " Projector pose from OpenCV PnP."
          : projectorSource === "dlt"
            ? " Projector pose from in-browser DLT."
            : ""}
      </p>
    </div>
  );
}
