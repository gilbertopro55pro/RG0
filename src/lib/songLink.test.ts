import { describe, expect, it } from "vitest";
import { isMediaResponse, isPrivateAddress, parseSongLink, songLinkFileName } from "@/lib/songLink";

// A direct link to the reel's song (owner, 2026-11-02).
describe("song link", () => {
  it("takes a direct link to a file, with or without https://", () => {
    const a = parseSongLink("https://cdn.example.com/music/song.mp3");
    expect("url" in a && a.url.href).toBe("https://cdn.example.com/music/song.mp3");
    const b = parseSongLink("  files.example.org/clip.mp4 ");
    expect("url" in b && b.url.href).toBe("https://files.example.org/clip.mp4");
  });

  it("explains a post on Instagram, TikTok or YouTube instead of trying it", () => {
    for (const link of [
      "https://www.instagram.com/reel/abc123/",
      "https://vm.tiktok.com/ZMabc/",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=x",
      "https://open.spotify.com/track/1",
      "https://www.facebook.com/watch/?v=1",
    ]) {
      expect(parseSongLink(link)).toEqual({ problem: "social" });
    }
  });

  it("refuses what the server must not fetch", () => {
    for (const link of ["ftp://example.com/a.mp3", "javascript:alert(1)", "http://localhost/a.mp3", "http://intranet/a.mp3", "https://user:pw@example.com/a.mp3", "https://example.com:8080/a.mp3", "", 42]) {
      expect(parseSongLink(link)).toEqual({ problem: "invalid" });
    }
  });

  it("knows the private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "104.16.1.1", "172.32.0.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("takes audio and video, not a web page", () => {
    const u = new URL("https://example.com/x");
    expect(isMediaResponse("audio/mpeg", u)).toBe(true);
    expect(isMediaResponse("video/mp4; codecs=avc1", u)).toBe(true);
    expect(isMediaResponse("text/html; charset=utf-8", u)).toBe(false);
    expect(isMediaResponse("application/octet-stream", new URL("https://example.com/song.m4a"))).toBe(true);
    expect(isMediaResponse("application/octet-stream", u)).toBe(false);
  });

  it("names the file after the link", () => {
    expect(songLinkFileName(new URL("https://example.com/a/%D7%A9%D7%99%D7%A8.mp3"), "audio/mpeg")).toBe("שיר.mp3");
    expect(songLinkFileName(new URL("https://example.com/download?id=5"), "video/mp4")).toBe("download.mp4");
    expect(songLinkFileName(new URL("https://example.com/"), "audio/mpeg")).toBe("example.com.mp3");
  });
});
