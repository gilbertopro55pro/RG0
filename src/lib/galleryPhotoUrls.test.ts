import { describe, expect, it } from "vitest";
import {
  ORIGINAL_REDIRECT_CACHE_SECONDS,
  ORIGINAL_SIGNED_SECONDS,
  photographerImageUrl,
  photographerOriginalUrl,
  resizedPhotoUrl,
} from "@/lib/galleryPhotoUrls";

const GALLERY = "0b4c7d2e-1111-4a2b-8c3d-9e0f12345678";
const PHOTO = "7a8b9c0d-2222-4e5f-a6b7-c8d9e0f12345";
const CDN = "https://cdn.myframeflow.com/previews/abc/def.webp";
const SIGNED = "https://photographer-flow.example.r2.cloudflarestorage.com/galleries/u/g/p.jpg?X-Amz-Signature=abc";

describe("photo routes", () => {
  it("builds short same-origin routes", () => {
    expect(photographerOriginalUrl(GALLERY, PHOTO)).toBe(`/api/galleries/${GALLERY}/photos/${PHOTO}/original`);
    expect(photographerImageUrl(GALLERY, PHOTO, 640)).toBe(`/api/galleries/${GALLERY}/photos/${PHOTO}/image?size=640`);
    expect(photographerImageUrl(GALLERY, PHOTO, 383.6)).toBe(`/api/galleries/${GALLERY}/photos/${PHOTO}/image?size=384`);
  });

  it("is a fraction of a presigned URL's length", () => {
    expect(photographerOriginalUrl(GALLERY, PHOTO).length).toBeLessThan(110);
  });

  it("never lets a cached redirect outlive its signature", () => {
    expect(ORIGINAL_REDIRECT_CACHE_SECONDS).toBeLessThan(ORIGINAL_SIGNED_SECONDS);
    expect(ORIGINAL_SIGNED_SECONDS - ORIGINAL_REDIRECT_CACHE_SECONDS).toBeGreaterThanOrEqual(300);
  });
});

describe("resizedPhotoUrl", () => {
  it("uses the preview when there is one", () => {
    expect(resizedPhotoUrl({ url: photographerOriginalUrl(GALLERY, PHOTO), previewUrl: CDN }, 640)).toBe(CDN);
  });

  it("never falls back to the photographer's original: the server-resized copy instead", () => {
    const url = resizedPhotoUrl({ url: photographerOriginalUrl(GALLERY, PHOTO), previewUrl: null }, 640);
    expect(url).toBe(`/api/galleries/${GALLERY}/photos/${PHOTO}/image?size=640`);
    expect(url).not.toContain("/original");
    expect(resizedPhotoUrl({ url: photographerOriginalUrl(GALLERY, PHOTO) }, 1920)).toBe(`/api/galleries/${GALLERY}/photos/${PHOTO}/image?size=1920`);
  });

  it("keeps a photo that is being uploaded as it is", () => {
    expect(resizedPhotoUrl({ url: "blob:https://myframeflow.com/1234", previewUrl: null }, 640)).toBe("blob:https://myframeflow.com/1234");
    expect(resizedPhotoUrl({ url: "data:image/jpeg;base64,AAAA" }, 640)).toBe("data:image/jpeg;base64,AAAA");
    const uploaded = `/api/galleries/${GALLERY}/photos/${PHOTO}/image?size=2000`;
    expect(resizedPhotoUrl({ url: uploaded, previewUrl: null }, 640)).toBe(uploaded);
    expect(resizedPhotoUrl({ url: uploaded, previewUrl: `/api/galleries/${GALLERY}/photos/${PHOTO}/preview` }, 640)).toBe(
      `/api/galleries/${GALLERY}/photos/${PHOTO}/preview`
    );
  });

  it("sends a signed URL through the image optimizer, as before", () => {
    expect(resizedPhotoUrl({ url: SIGNED, previewUrl: null }, 640)).toBe(`/_next/image?url=${encodeURIComponent(SIGNED)}&w=640&q=75`);
  });

  it("doesn't mistake a longer path for an original route", () => {
    const other = `/api/galleries/${GALLERY}/photos/${PHOTO}/original/extra`;
    expect(resizedPhotoUrl({ url: other, previewUrl: null }, 640)).toBe(other);
  });
});
