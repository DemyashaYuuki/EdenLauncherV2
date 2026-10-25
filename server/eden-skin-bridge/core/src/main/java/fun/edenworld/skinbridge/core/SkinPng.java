package fun.edenworld.skinbridge.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;

/**
 * Validates skin uploads before any decoding work: bounded base64 and byte size, PNG signature,
 * IHDR dimensions limited to the standard 64x64 and 64x32 layouts. Accepted images are decoded and
 * re-encoded, which strips every ancillary chunk.
 */
public final class SkinPng {
	public static final int MAX_BYTES = 512 * 1024;
	private static final byte[] SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

	public static final class InvalidSkinException extends Exception {
		private static final long serialVersionUID = 1L;

		public InvalidSkinException(String message) {
			super(message);
		}
	}

	private SkinPng() {}

	public static byte[] decodeBase64(String data) throws InvalidSkinException {
		if (data == null || data.length() > (MAX_BYTES / 3 + 2) * 4) {
			throw new InvalidSkinException("too_large");
		}
		try {
			return Base64.getDecoder().decode(data);
		} catch (IllegalArgumentException e) {
			throw new InvalidSkinException("bad_base64");
		}
	}

	public static int[] dimensions(byte[] png) throws InvalidSkinException {
		if (png.length < 33 || png.length > MAX_BYTES) {
			throw new InvalidSkinException(png.length > MAX_BYTES ? "too_large" : "not_png");
		}
		for (int i = 0; i < SIGNATURE.length; i++) {
			if (png[i] != SIGNATURE[i]) {
				throw new InvalidSkinException("not_png");
			}
		}
		if (png[12] != 'I' || png[13] != 'H' || png[14] != 'D' || png[15] != 'R') {
			throw new InvalidSkinException("not_png");
		}
		int width = readInt(png, 16);
		int height = readInt(png, 20);
		return new int[] {width, height};
	}

	private static int readInt(byte[] bytes, int offset) {
		return ((bytes[offset] & 0xff) << 24)
				| ((bytes[offset + 1] & 0xff) << 16)
				| ((bytes[offset + 2] & 0xff) << 8)
				| (bytes[offset + 3] & 0xff);
	}

	/** Checks the header, decodes and re-encodes a standard skin. */
	public static byte[] sanitize(byte[] png) throws InvalidSkinException {
		int[] size = dimensions(png);
		if (size[0] != 64 || (size[1] != 64 && size[1] != 32)) {
			throw new InvalidSkinException("bad_dimensions");
		}
		BufferedImage image;
		try (MemoryCacheImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(png))) {
			ImageReader reader = ImageIO.getImageReadersByFormatName("png").next();
			try {
				reader.setInput(input, true, true);
				image = reader.read(0);
			} finally {
				reader.dispose();
			}
		} catch (IOException | RuntimeException e) {
			throw new InvalidSkinException("corrupt_png");
		}
		if (image == null || image.getWidth() != size[0] || image.getHeight() != size[1]) {
			throw new InvalidSkinException("corrupt_png");
		}
		BufferedImage rgba = new BufferedImage(size[0], size[1], BufferedImage.TYPE_INT_ARGB);
		rgba.setRGB(0, 0, size[0], size[1], image.getRGB(0, 0, size[0], size[1], null, 0, size[0]), 0, size[0]);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try {
			ImageIO.write(rgba, "png", out);
		} catch (IOException e) {
			throw new InvalidSkinException("corrupt_png");
		}
		return out.toByteArray();
	}
}
