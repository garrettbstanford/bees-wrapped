import { patches } from '../data/patches.js';

export default function PatchSelector({ selected, unavailable, onToggle, onClear, onUnavailable }) {
  return <section className="patch-dock" aria-label="Tote patches">
    <div className="dock-heading">
      <span>PATCHES</span>
    </div>
    <div className="patch-options" role="group" aria-label="Select as many patches as you like">
      <button className="patch-option no-patch" aria-label="No Patch" aria-pressed={selected.length === 0} onClick={onClear}>
        <span className="patch-art"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="14" /><path d="m14 34 20-20" /></svg></span>
        <span className="patch-name">No Patch</span>
      </button>
      <span className="dock-divider" aria-hidden="true" />
      {patches.map(patch => {
        const failed = unavailable.includes(patch.id), active = selected.includes(patch.id);
        return <button key={patch.id} className="patch-option" aria-pressed={active}
          aria-label={failed ? `${patch.name} — image unavailable` : patch.name}
          disabled={failed} onClick={() => onToggle(patch.id)}>
          <span className="patch-art">
            {failed ? <span className="image-missing">Unavailable</span>
              : <img src={patch.image} alt="" onError={() => onUnavailable(patch.id)} draggable="false" />}
            <span className="patch-check" aria-hidden="true">✓</span>
          </span>
          <span className="patch-name">{patch.name}</span>
        </button>;
      })}
    </div>
  </section>;
}
