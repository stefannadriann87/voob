"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";

export default function ClientProfilePage() {
  const router = useRouter();
  const { user, hydrated, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "CLIENT") {
      router.replace("/client/dashboard");
      return;
    }
    // Initialize form with user data
    setName(user.name || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setAvatar(user.avatar || null);
    setAvatarPreview(user.avatar || null);
  }, [hydrated, user, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await updateProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
      });
      setSuccess("Profil actualizat cu succes!");
      setIsEditing(false);
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la actualizarea profilului.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName(user?.name || "");
    setEmail(user?.email || "");
    setPhone(user?.phone || "");
    setAvatar(user?.avatar || null);
    setAvatarPreview(user?.avatar || null);
    setError(null);
    setSuccess(null);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Te rog selectează o imagine validă.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Imaginea trebuie să fie mai mică de 5MB.");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatarPreview(base64String);
      setAvatar(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatar) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      await updateProfile({ avatar });
      setSuccess("Avatar actualizat cu succes!");
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la actualizarea avatarului.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!hydrated || !user) {
    return null;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-white mt-8 desktop:mt-0">Profil</h1>
        <p className="mt-2 text-sm text-white/60">Gestionează datele tale personale și preferințele contului.</p>
      </div>

      <div className="desktop:rounded-3xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-8 mt-8 desktop:mt-0">
        {!isEditing ? (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Informații personale</h2>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                <i className="fas fa-edit mr-2" />
                Editează
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-white/70">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/10">
                    {user.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#6366F1]/20 text-2xl font-semibold text-[#6366F1]">
                        {user.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Nume complet</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.name || "—"}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Email</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.email || "—"}
                </div>
                <p className="text-xs text-white/50">Email-ul nu poate fi modificat.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Număr de telefon</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.phone || "—"}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Editează profil</h2>
              <p className="mt-1 text-sm text-white/60">Actualizează datele tale personale.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-white/70">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/10">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#6366F1]/20 text-2xl font-semibold text-[#6366F1]">
                        {user.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                      <i className="fas fa-upload mr-2" />
                      {avatarPreview ? "Schimbă poza" : "Încarcă poză"}
                    </label>
                    {avatarPreview && avatar !== user?.avatar && (
                      <button
                        type="button"
                        onClick={handleAvatarUpload}
                        disabled={uploadingAvatar}
                        className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadingAvatar ? "Se salvează..." : "Salvează avatar"}
                      </button>
                    )}
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarPreview(user?.avatar || null);
                          setAvatar(user?.avatar || null);
                        }}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                      >
                        Anulează
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/50">Format acceptat: JPG, PNG, GIF (max 5MB)</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Nume complet *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  placeholder="Nume complet"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/50 cursor-not-allowed"
                  placeholder="email@example.com"
                />
                <p className="text-xs text-white/50">Email-ul nu poate fi modificat.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Număr de telefon</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  placeholder="+40 7XX XXX XXX"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Se salvează..." : "Salvează modificările"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

