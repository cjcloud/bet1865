"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; name: string };

const ADD_NEW = "__add_new__";

// SPEC.md §6.2 mobile requirement: the file input uses `capture` so phones
// offer the camera directly, not just a file browser. Touch targets here are
// sized ~44px minimum.
export default function UploadForm({
  players,
  bookmakers,
}: {
  players: Option[];
  bookmakers: Option[];
}) {
  const router = useRouter();
  const [playerId, setPlayerId] = useState("");
  const [bookmakerId, setBookmakerId] = useState("");
  const [newBookmakerName, setNewBookmakerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!playerId) return setError("Please choose who placed the bet.");
    if (!bookmakerId) return setError("Please choose a bookmaker.");
    if (bookmakerId === ADD_NEW && !newBookmakerName.trim())
      return setError("Please type the new bookmaker's name.");
    if (!file) return setError("Please choose or take a photo of the slip.");

    const formData = new FormData();
    formData.set("player_id", playerId);
    if (bookmakerId === ADD_NEW) {
      formData.set("new_bookmaker_name", newBookmakerName.trim());
    } else {
      formData.set("bookmaker_id", bookmakerId);
    }
    formData.set("file", file);

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong uploading the slip.");
        setSubmitting(false);
        return;
      }
      router.push(`/admin/upload/confirm/${data.betId}`);
    } catch {
      setError("Network error — please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
      <div>
        <label className="block mb-1 text-sm text-white/70" htmlFor="player">
          Who placed the bet?
        </label>
        <select
          id="player"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
        >
          <option value="">Choose a player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-1 text-sm text-white/70" htmlFor="bookmaker">
          Bookmaker
        </label>
        <select
          id="bookmaker"
          value={bookmakerId}
          onChange={(e) => setBookmakerId(e.target.value)}
          className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
        >
          <option value="">Choose a bookmaker…</option>
          {bookmakers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new bookmaker…</option>
        </select>
        {bookmakerId === ADD_NEW && (
          <input
            type="text"
            placeholder="New bookmaker name"
            value={newBookmakerName}
            onChange={(e) => setNewBookmakerName(e.target.value)}
            className="mt-2 w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
          />
        )}
      </div>

      <div>
        <label className="block mb-1 text-sm text-white/70" htmlFor="slip">
          Photo of the bet slip
        </label>
        <input
          id="slip"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full min-h-[44px] text-white file:mr-3 file:min-h-[44px] file:px-3 file:rounded file:border-0 file:bg-accent file:text-black file:font-semibold"
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Slip preview" className="mt-3 max-h-64 rounded border border-white/20" />
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] w-full rounded bg-accent text-black font-semibold px-4 disabled:opacity-60"
      >
        {submitting ? "Reading your slip…" : "Upload Slip"}
      </button>
    </form>
  );
}
