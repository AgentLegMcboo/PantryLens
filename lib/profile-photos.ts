import { useEffect } from 'react';
import { create } from 'zustand';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';
import { changeProfilePhoto, profilePhotoBytes } from './profile-photo-core';

const BUCKET = 'profile-photos';
type Photo = { path: string | null; url: string | null; loadedAt: number; error: string | null };
const usePhotos = create<{ photos: Record<string, Photo> }>(() => ({ photos: {} }));
const requests = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
let epoch = 0;
let viewer: string | null = null;

// Never carry signed URLs or another account's cached roster across sign-in.
supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id ?? null;
  if (next !== viewer) {
    viewer = next;
    epoch++;
    requests.clear();
    versions.clear();
    usePhotos.setState({ photos: {} });
  }
});

function put(userId: string, photo: Photo) {
  usePhotos.setState(state => ({ photos: { ...state.photos, [userId]: photo } }));
}

export async function loadProfilePhoto(userId: string, force = false): Promise<void> {
  const cached = usePhotos.getState().photos[userId];
  if (!force && cached && !cached.error && Date.now() - cached.loadedAt < 60000) return;
  if (requests.has(userId)) return requests.get(userId)!;
  const startedEpoch = epoch;
  const version = versions.get(userId) ?? 0;
  const request = (async () => {
    try {
      const { data, error } = await supabase.from('user_profiles').select('avatar_path').eq('id', userId).maybeSingle();
      if (error) throw error;
      const path = data?.avatar_path ?? null;
      let url: string | null = null;
      if (path) {
        const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (signed.error) throw signed.error;
        url = signed.data.signedUrl;
      }
      if (epoch === startedEpoch && (versions.get(userId) ?? 0) === version) {
        put(userId, { path, url, loadedAt: Date.now(), error: null });
      }
    } catch (error: any) {
      if (epoch === startedEpoch && (versions.get(userId) ?? 0) === version) {
        put(userId, { path: cached?.path ?? null, url: cached?.url ?? null, loadedAt: 0, error: error?.message ?? 'Could not load profile photo.' });
      }
    }
  })();
  requests.set(userId, request);
  try { await request; } finally {
    if (requests.get(userId) === request) requests.delete(userId);
  }
}

export function useProfilePhoto(userId?: string) {
  const photo = usePhotos(state => userId ? state.photos[userId] : undefined);
  useEffect(() => {
    if (!userId) return;
    void loadProfilePhoto(userId);
    // Refresh before the signed URL expires, including long-running sessions.
    const timer = setInterval(() => { void loadProfilePhoto(userId, true); }, 45 * 60 * 1000);
    return () => clearInterval(timer);
  }, [userId]);
  return photo;
}

export async function saveProfilePhoto(expectedUserId: string, asset: ImagePickerAsset | null): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user || auth.user.id !== expectedUserId) throw new Error('Your account changed. Reopen your profile and try again.');
  const userId = auth.user.id;
  const startedEpoch = epoch;
  const { data: previous, error } = await supabase.from('user_profiles').select('avatar_path').eq('id', userId).maybeSingle();
  if (error) throw error;
  let next: { path: string; bytes: ArrayBuffer } | null = null;
  if (asset) {
    const edge = Math.min(asset.width, asset.height);
    if (!Number.isFinite(edge) || edge <= 0) throw new Error('This photo could not be read. Choose another image.');
    const context = ImageManipulator.manipulate(asset.uri);
    context.crop({ originX: Math.floor((asset.width - edge) / 2), originY: Math.floor((asset.height - edge) / 2), width: edge, height: edge });
    context.resize({ width: 512, height: 512 });
    const rendered = await context.renderAsync();
    const photo = await rendered.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
    if (!photo.base64) throw new Error('This photo could not be prepared. Try another image.');
    next = { path: `${userId}/${randomUUID()}.jpg`, bytes: profilePhotoBytes(photo.base64) };
  }
  await changeProfilePhoto(userId, previous?.avatar_path ?? null, next, {
    upload: async (path, bytes) => {
      const result = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (result.error) throw result.error;
    },
    save: async path => {
      const result = await supabase.from('user_profiles').upsert({ id: userId, avatar_path: path }).select('id').single();
      if (result.error) throw result.error;
    },
    remove: async path => {
      const result = await supabase.storage.from(BUCKET).remove([path]);
      if (result.error) throw result.error;
    },
  });
  if (epoch !== startedEpoch) return;
  versions.set(userId, (versions.get(userId) ?? 0) + 1);
  // Stop an older in-flight read from restoring the photo that was just removed.
  requests.delete(userId);
  put(userId, { path: next?.path ?? null, url: asset?.uri ?? null, loadedAt: 0, error: null });
  await loadProfilePhoto(userId, true);
}
