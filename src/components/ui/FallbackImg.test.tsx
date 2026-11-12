/**
 * FallbackImg — the F-165 client rule for NFT images:
 * src → (first error) fallbackSrc when non-null → (next error) placeholder,
 * with crossOrigin="anonymous" ONLY when a fallback exists, and URLs
 * rendered verbatim (no proxy, no key).
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FallbackImg } from "@/components/ui/FallbackImg";

const GATEWAY = "https://gateway.example/ipfs/bafyimage";
const IPFS_IO = "https://ipfs.io/ipfs/bafyimage";
const PLAIN = "https://cdn.example/nft/1.png";

function img(): HTMLImageElement | null {
  return document.querySelector("img");
}

function placeholder() {
  return <span data-testid="ph">No art</span>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the fallback chain", () => {
  it("renders src verbatim first", () => {
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" placeholder={placeholder()} />);
    expect(img()?.getAttribute("src")).toBe(GATEWAY);
    expect(screen.queryByTestId("ph")).toBeNull();
  });

  it("switches to fallbackSrc on the first error", () => {
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" placeholder={placeholder()} />);
    fireEvent.error(img()!);
    expect(img()?.getAttribute("src")).toBe(IPFS_IO);
    expect(screen.queryByTestId("ph")).toBeNull();
  });

  it("renders the placeholder on the next error", () => {
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" placeholder={placeholder()} />);
    fireEvent.error(img()!);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it("with no fallback, the first error goes straight to the placeholder", () => {
    render(<FallbackImg src={PLAIN} fallbackSrc={null} alt="" placeholder={placeholder()} />);
    fireEvent.error(img()!);
    expect(img()).toBeNull();
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it("an absent fallback field (older backend) behaves like null", () => {
    render(<FallbackImg src={PLAIN} alt="" placeholder={placeholder()} />);
    fireEvent.error(img()!);
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it.each([
    ["null", null],
    ["empty string", ""],
    ["undefined", undefined],
  ])("src %s renders the placeholder with no <img>", (_label, src) => {
    render(<FallbackImg src={src} fallbackSrc={null} alt="" placeholder={placeholder()} />);
    expect(img()).toBeNull();
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it("renders nothing when exhausted and no placeholder is given", () => {
    const { container } = render(<FallbackImg src={PLAIN} alt="" />);
    fireEvent.error(img()!);
    expect(container.innerHTML).toBe("");
  });

  it("a fallback equal to src is not tried twice", () => {
    render(<FallbackImg src={IPFS_IO} fallbackSrc={IPFS_IO} alt="" placeholder={placeholder()} />);
    fireEvent.error(img()!);
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it("a new src restarts the chain on the same instance", () => {
    const { rerender } = render(
      <FallbackImg src={PLAIN} fallbackSrc={null} alt="" placeholder={placeholder()} />,
    );
    fireEvent.error(img()!);
    expect(img()).toBeNull();

    const next = "https://cdn.example/nft/2.png";
    rerender(<FallbackImg src={next} fallbackSrc={null} alt="" placeholder={placeholder()} />);
    expect(img()?.getAttribute("src")).toBe(next);
  });
});

describe("crossOrigin", () => {
  it('is "anonymous" when a fallback exists (IPFS gateway image)', () => {
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    expect(img()?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("stays anonymous on the ipfs.io fallback", () => {
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    fireEvent.error(img()!);
    expect(img()?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("is NOT set without a fallback, so non-CORS NFT hosts keep loading", () => {
    render(<FallbackImg src={PLAIN} fallbackSrc={null} alt="" />);
    expect(img()?.hasAttribute("crossorigin")).toBe(false);
  });
});

describe("pass-through", () => {
  it("forwards img attributes and onLoad", () => {
    const onLoad = vi.fn();
    render(
      <FallbackImg
        src={PLAIN}
        alt="Atlas #1"
        className="h-full w-full"
        loading="lazy"
        onLoad={onLoad}
      />,
    );
    const el = img()!;
    expect(el.getAttribute("alt")).toBe("Atlas #1");
    expect(el.getAttribute("class")).toBe("h-full w-full");
    expect(el.getAttribute("loading")).toBe("lazy");
    fireEvent.load(el);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});

describe("a failure that happened before hydration", () => {
  function stubImage({
    complete,
    naturalWidth,
    decode,
  }: {
    complete: boolean;
    naturalWidth: number;
    decode: (() => Promise<void>) | undefined;
  }) {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(complete);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(naturalWidth);
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      writable: true,
      value: decode,
    });
  }

  afterEach(() => {
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it("an already-broken image (decode rejects) advances to the fallback", async () => {
    // Only the primary is broken; the fallback decodes. (The stub's
    // `complete` is permanently true, which a freshly assigned src never
    // is in a browser, so each URL's verdict must come from decode().)
    const decode = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("broken"))
      .mockResolvedValue(undefined);
    stubImage({ complete: true, naturalWidth: 0, decode });
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(img()?.getAttribute("src")).toBe(IPFS_IO);
  });

  it("both already broken → the placeholder", async () => {
    stubImage({ complete: true, naturalWidth: 0, decode: () => Promise.reject(new Error("broken")) });
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" placeholder={placeholder()} />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(img()).toBeNull();
    expect(screen.getByTestId("ph")).not.toBeNull();
  });

  it("an SVG with no intrinsic size (decode resolves) is NOT treated as broken", async () => {
    stubImage({ complete: true, naturalWidth: 0, decode: () => Promise.resolve() });
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(img()?.getAttribute("src")).toBe(GATEWAY);
  });

  it("without decode() support nothing is guessed", async () => {
    stubImage({ complete: true, naturalWidth: 0, decode: undefined });
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(img()?.getAttribute("src")).toBe(GATEWAY);
  });

  it("a loaded image (naturalWidth > 0) is left alone", async () => {
    const decode = vi.fn(() => Promise.reject(new Error("unused")));
    stubImage({ complete: true, naturalWidth: 640, decode });
    render(<FallbackImg src={GATEWAY} fallbackSrc={IPFS_IO} alt="" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(decode).not.toHaveBeenCalled();
    expect(img()?.getAttribute("src")).toBe(GATEWAY);
  });
});
