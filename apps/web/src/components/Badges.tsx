import type { Resident } from "../types";

export function Badges({ resident }: { resident: Resident }) {
  return (
    <>
      <span className={resident.movedOutDate ? "badge muted" : "badge ok"}>
        {resident.movedOutDate ? "除票" : "現住"}
      </span>
      {resident.restrictions && resident.restrictions.length > 0 && <span className="badge warn">支援措置</span>}
      {resident.foreigner && <span className="badge blue">外国人</span>}
    </>
  );
}
