package fun.edenworld.skinbridge.core;

import java.util.List;
import java.util.UUID;

/**
 * Server-side skin storage and application (SkinsRestorer on the platforms). Calls may block on
 * network or database I/O and are only made from the bridge worker threads.
 */
public interface SkinBackend {
	AuthGate.Readiness readiness();

	/** Turns a sanitized PNG into a signed textures property (MineSkin through SkinsRestorer). */
	SignedTexture generate(byte[] png, String variant) throws BackendException;

	/** Stores the property as the player's selection and applies it live when the player is online. */
	ApplyResult apply(UUID player, SignedTexture texture) throws BackendException;

	List<Look> looks();

	ApplyResult applyLook(UUID player, String lookId) throws BackendException;

	record SignedTexture(String value, String signature) {}

	record Look(String id, String label, boolean hasCape) {}

	enum ApplyResult {
		APPLIED,
		SAVED_OFFLINE
	}

	final class BackendException extends Exception {
		private static final long serialVersionUID = 1L;
		private final String code;

		public BackendException(String code, String message) {
			super(message);
			this.code = code;
		}

		public BackendException(String code, String message, Throwable cause) {
			super(message, cause);
			this.code = code;
		}

		public String code() {
			return code;
		}
	}
}
