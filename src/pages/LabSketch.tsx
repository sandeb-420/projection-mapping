import { fitSceneTopDown } from "../lib/calib/sceneSketch";
import { originFromPose } from "../lib/calib/triangulate";
import type { Mapping } from "../lib/pipeline/mapping";
import type { VirtualRoom } from "../lib/sim/room";

export function LabSketch(props: { mapping: Mapping; room: VirtualRoom }) {
  const { mapping, room } = props;
  const sketch = fitSceneTopDown(mapping, 360, 200, 18, {
    projector: room.projector.eye,
    phones: room.phones.map((phone) => ({ id: phone.id, world: originFromPose(phone.pose) })),
  });

  return (
    <div>
      <svg
        className="sketch"
        viewBox={`0 0 ${sketch.width} ${sketch.height}`}
        role="img"
        aria-label="Top-down ground-truth versus recovered projector and phones"
      >
        {sketch.marks
          .filter((m) => m.kind === "point")
          .map((m) => (
            <circle key={m.id} cx={m.x} cy={m.y} r={1.3} fill="#5a635c" />
          ))}
        {sketch.gtPhones.map((m) => (
          <circle
            key={m.id}
            cx={m.x}
            cy={m.y}
            r={7}
            fill="none"
            stroke="#8b948c"
            strokeWidth="1.2"
          />
        ))}
        {sketch.phones.map((m) => (
          <g key={m.id}>
            <circle cx={m.x} cy={m.y} r={4} fill="#6fd7c8" />
            <text x={m.x + 7} y={m.y + 3} fill="#8b948c" fontSize="8">
              {m.id}
            </text>
          </g>
        ))}
        {sketch.gtProjector ? (
          <polygon
            points={`${sketch.gtProjector.x},${sketch.gtProjector.y - 8} ${sketch.gtProjector.x - 6},${sketch.gtProjector.y + 6} ${sketch.gtProjector.x + 6},${sketch.gtProjector.y + 6}`}
            fill="none"
            stroke="#8b948c"
            strokeWidth="1.2"
          />
        ) : null}
        {sketch.projector ? (
          <polygon
            points={`${sketch.projector.x},${sketch.projector.y - 6} ${sketch.projector.x - 5},${sketch.projector.y + 5} ${sketch.projector.x + 5},${sketch.projector.y + 5}`}
            fill="#d7a24a"
          />
        ) : null}
      </svg>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        Top-down: hollow marks are ground truth, gold/cyan are recovered. Gray dots
        are mapped surfaces. If the triangles sit on each other, OpenCV PnP found
        the virtual projector.
      </p>
    </div>
  );
}
