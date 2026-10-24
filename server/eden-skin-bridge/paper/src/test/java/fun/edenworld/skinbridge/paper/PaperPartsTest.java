package fun.edenworld.skinbridge.paper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;
import net.skinsrestorer.api.property.SkinProperty;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PaperPartsTest {
	@TempDir
	Path root;

	private void paperGlobal(String yaml) throws Exception {
		Files.createDirectories(root.resolve("config"));
		Files.writeString(root.resolve("config/paper-global.yml"), yaml, StandardCharsets.UTF_8);
	}

	@Test
	void forwardingMustBeEnabledWithASecretAndOfflineMode() throws Exception {
		assertFalse(ForwardingCheck.inspect(root.toFile(), false, true).trusted());
		paperGlobal("proxies:\n  velocity:\n    enabled: false\n    secret: abc\n");
		assertFalse(ForwardingCheck.inspect(root.toFile(), false, true).trusted());
		paperGlobal("proxies:\n  velocity:\n    enabled: true\n    secret: ''\n");
		assertFalse(ForwardingCheck.inspect(root.toFile(), false, true).trusted());
		paperGlobal("proxies:\n  velocity:\n    enabled: true\n    secret: abc\n");
		assertFalse(ForwardingCheck.inspect(root.toFile(), true, true).trusted());
		assertTrue(ForwardingCheck.inspect(root.toFile(), false, true).trusted());
		assertTrue(ForwardingCheck.inspect(root.toFile(), true, false).trusted());
	}

	@Test
	void storageNamesAreStablePerPlayerAndShort() {
		UUID a = UUID.randomUUID();
		assertEquals(SkinsRestorerBackend.storageName(a), SkinsRestorerBackend.storageName(a));
		assertNotEquals(SkinsRestorerBackend.storageName(a), SkinsRestorerBackend.storageName(UUID.randomUUID()));
		assertEquals(16, SkinsRestorerBackend.storageName(a).length());
		assertTrue(SkinsRestorerBackend.storageName(a).matches("eden[0-9a-f]{12}"));
	}

	@Test
	void capeDetectionReadsTheSignedTexturesValue() {
		String withCape = Base64.getEncoder().encodeToString(
				"{\"textures\":{\"SKIN\":{\"url\":\"x\"},\"CAPE\":{\"url\":\"y\"}}}".getBytes(StandardCharsets.UTF_8));
		String without = Base64.getEncoder().encodeToString("{\"textures\":{\"SKIN\":{\"url\":\"x\"}}}".getBytes(StandardCharsets.UTF_8));
		assertTrue(SkinsRestorerBackend.hasCape(SkinProperty.of(withCape, "sig")));
		assertFalse(SkinsRestorerBackend.hasCape(SkinProperty.of(without, "sig")));
		assertFalse(SkinsRestorerBackend.hasCape(SkinProperty.of("%%%", "sig")));
	}
}
