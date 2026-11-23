import { MapPin, Pencil, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { saveCinema, type AdminCinema } from '@/lib/adminApi';

interface Props {
  cinemas: AdminCinema[];
  sessionCounts: Map<string, number>;
  onSaved: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}

const empty = { name: '', address: '', city: 'Almaty', is_active: true };

/** Cinemas that sessions can be added to. Hidden cinemas keep their old sessions but are not offered for new ones. */
export default function AdminCinemas({ cinemas, sessionCounts, onSaved, onError }: Props) {
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveCinema({ ...form, name: form.name.trim(), address: form.address.trim(), city: form.city.trim() || 'Almaty' }, editing);
      setForm(empty);
      setEditing(undefined);
      await onSaved(editing ? 'Cinema updated.' : 'Cinema added.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the cinema.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: AdminCinema) {
    try {
      await saveCinema({ name: c.name, address: c.address, city: c.city, is_active: !c.is_active }, c.id);
      await onSaved(c.is_active ? `${c.name} is hidden from new sessions.` : `${c.name} is active again.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update the cinema.');
    }
  }

  const input = 'mt-1 w-full rounded-lg border border-stone-300 p-2.5';
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-4 font-semibold">Cinemas ({cinemas.length})</h2>
        <div className="space-y-2">
          {cinemas.map((c) => (
            <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 p-4 ${c.is_active ? '' : 'opacity-55'}`}>
              <div className="min-w-0">
                <p className="font-semibold">{c.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500">
                  <MapPin size={14} /> {c.address || 'No address'} · {c.city} · {sessionCounts.get(c.id) ?? 0} sessions
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditing(c.id); setForm({ name: c.name, address: c.address, city: c.city, is_active: c.is_active }); }} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">
                  <Pencil size={15} /> Edit
                </button>
                <button type="button" onClick={() => void toggle(c)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50">
                  {c.is_active ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="h-fit rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{editing ? 'Edit cinema' : 'Add cinema'}</h2>
          {editing && (
            <button type="button" aria-label="Cancel editing" onClick={() => { setEditing(undefined); setForm(empty); }}><X size={18} /></button>
          )}
        </div>
        <label className="block text-sm">Name<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kinopark 11 IMAX Esentai" className={input} /></label>
        <label className="mt-3 block text-sm">Address<input maxLength={200} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Esentai Mall, 77/8 Al-Farabi Ave" className={input} /></label>
        <label className="mt-3 block text-sm">City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={input} /></label>
        <button disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 p-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
          <Plus size={17} /> {editing ? 'Save changes' : 'Add cinema'}
        </button>
      </form>
    </div>
  );
}
