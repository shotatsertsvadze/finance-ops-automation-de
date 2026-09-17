import { ROLE_LABELS } from "../lib/format.js";

export default function ActorPicker({ users, actorId, onChange }) {
  return (
    <div className="actor-picker">
      <label className="label" htmlFor="actor">Angemeldet als</label>
      <select id="actor" value={actorId} onChange={(e) => onChange(e.target.value)}>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} · {ROLE_LABELS[user.role] ?? user.role}
          </option>
        ))}
      </select>
    </div>
  );
}
