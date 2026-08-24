import type { ProjectorSettings } from "../lib/projector/settings";

export function ProjectorSettingsForm(props: {
  value: ProjectorSettings;
  onChange: (next: ProjectorSettings) => void;
}) {
  const { value, onChange } = props;

  function patch(partial: Partial<ProjectorSettings>) {
    onChange({ ...value, ...partial });
  }

  function numOrNull(raw: string): number | null {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <label className="field">
        Width
        <input
          type="number"
          min={320}
          max={3840}
          value={value.width}
          onChange={(e) => patch({ width: Number(e.target.value) || value.width })}
        />
      </label>
      <label className="field">
        Height
        <input
          type="number"
          min={180}
          max={2160}
          value={value.height}
          onChange={(e) => patch({ height: Number(e.target.value) || value.height })}
        />
      </label>
      <label className="field">
        FOV °
        <input
          type="number"
          min={8}
          max={80}
          step={0.5}
          value={value.fovY}
          onChange={(e) => patch({ fovY: Number(e.target.value) || value.fovY })}
        />
      </label>
      <label className="field">
        Throw to wall m
        <input
          type="number"
          min={0.2}
          max={20}
          step={0.1}
          placeholder="opt."
          value={value.throwM ?? ""}
          onChange={(e) => patch({ throwM: numOrNull(e.target.value) })}
        />
      </label>
      <label className="field">
        Image on wall m
        <input
          type="number"
          min={0.2}
          max={8}
          step={0.05}
          placeholder="opt."
          value={value.screenHeightM ?? ""}
          onChange={(e) => patch({ screenHeightM: numOrNull(e.target.value) })}
        />
      </label>
    </div>
  );
}
