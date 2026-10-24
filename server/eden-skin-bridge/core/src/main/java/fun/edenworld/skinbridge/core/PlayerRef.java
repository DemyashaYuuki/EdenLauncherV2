package fun.edenworld.skinbridge.core;

import java.util.Objects;
import java.util.UUID;

/** A connected player as identified by the server after authentication and forwarding. */
public record PlayerRef(UUID uuid, String name) {
	public PlayerRef {
		Objects.requireNonNull(uuid, "uuid");
		Objects.requireNonNull(name, "name");
	}
}
