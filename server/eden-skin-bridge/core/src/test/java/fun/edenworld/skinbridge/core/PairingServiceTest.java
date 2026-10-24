package fun.edenworld.skinbridge.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PairingServiceTest {
	private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T12:00:00Z"));
	private final PairingService service = new PairingService(clock, Duration.ofMinutes(5), 8);
	private final PlayerRef alice = new PlayerRef(UUID.randomUUID(), "Alice");
	private final PlayerRef mallory = new PlayerRef(UUID.randomUUID(), "Mallory");

	private static String code(PairingService.PairingException e) {
		return e.code();
	}

	@Test
	void completesOnlyAfterBothConfirmations() throws Exception {
		PairingService.Start start = service.start();
		assertEquals(PairingService.State.PENDING, service.status(start.pairingId(), start.pollSecret()).state());
		assertThrows(PairingService.PairingException.class, () -> service.finalizeLaunch(start.pairingId(), start.pollSecret()));

		String nonce = service.claim(start.code(), alice);
		PairingService.View claimed = service.status(start.pairingId(), start.pollSecret());
		assertEquals(PairingService.State.CLAIMED, claimed.state());
		assertNull(claimed.player(), "the player is revealed only after the in-game confirmation");
		assertThrows(PairingService.PairingException.class, () -> service.finalizeLaunch(start.pairingId(), start.pollSecret()));

		service.confirmInGame(nonce, alice);
		PairingService.View awaiting = service.status(start.pairingId(), start.pollSecret());
		assertEquals(PairingService.State.AWAITING_LAUNCHER, awaiting.state());
		assertEquals(alice, awaiting.player());

		assertEquals(alice, service.finalizeLaunch(start.pairingId(), start.pollSecret()));
		PairingService.PairingException replay =
				assertThrows(PairingService.PairingException.class, () -> service.finalizeLaunch(start.pairingId(), start.pollSecret()));
		assertEquals("not_confirmed", code(replay));
	}

	@Test
	void pollSecretIsRequiredAndSeparateFromTheCode() throws Exception {
		PairingService.Start start = service.start();
		assertEquals("invalid_pairing", code(assertThrows(PairingService.PairingException.class, () -> service.status(start.pairingId(), start.code()))));
		assertEquals("invalid_pairing", code(assertThrows(PairingService.PairingException.class, () -> service.status(start.pairingId(), "x"))));
		assertEquals("invalid_pairing", code(assertThrows(PairingService.PairingException.class, () -> service.status("nope", start.pollSecret()))));
	}

	@Test
	void codesExpire() throws Exception {
		PairingService.Start start = service.start();
		clock.advance(Duration.ofMinutes(6));
		assertEquals("expired", code(assertThrows(PairingService.PairingException.class, () -> service.claim(start.code(), alice))));
		assertEquals(PairingService.State.EXPIRED, service.status(start.pairingId(), start.pollSecret()).state());
	}

	@Test
	void anotherPlayerCannotTakeOverAClaimedCode() throws Exception {
		PairingService.Start start = service.start();
		String nonce = service.claim(start.code(), alice);
		assertEquals("unknown_code", code(assertThrows(PairingService.PairingException.class, () -> service.claim(start.code(), mallory))));
		assertEquals("wrong_player", code(assertThrows(PairingService.PairingException.class, () -> service.confirmInGame(nonce, mallory))));
		assertEquals("unknown_confirmation", code(assertThrows(PairingService.PairingException.class, () -> service.confirmInGame("guess", alice))));
	}

	@Test
	void playersHoldOneClaimAtATime() throws Exception {
		PairingService.Start first = service.start();
		PairingService.Start second = service.start();
		String oldNonce = service.claim(first.code(), alice);
		service.claim(second.code(), alice);
		assertEquals(PairingService.State.CANCELLED, service.status(first.pairingId(), first.pollSecret()).state());
		assertThrows(PairingService.PairingException.class, () -> service.confirmInGame(oldNonce, alice));
	}

	@Test
	void rejectionAndCancellationAreFinal() throws Exception {
		PairingService.Start start = service.start();
		String nonce = service.claim(start.code(), alice);
		service.rejectInGame(nonce, alice);
		assertEquals(PairingService.State.REJECTED, service.status(start.pairingId(), start.pollSecret()).state());
		assertThrows(PairingService.PairingException.class, () -> service.confirmInGame(nonce, alice));

		PairingService.Start other = service.start();
		service.cancel(other.pairingId(), other.pollSecret());
		assertThrows(PairingService.PairingException.class, () -> service.claim(other.code(), alice));
	}

	@Test
	void disconnectReleasesAClaim() throws Exception {
		PairingService.Start start = service.start();
		String nonce = service.claim(start.code(), alice);
		service.releasePlayer(alice);
		assertThrows(PairingService.PairingException.class, () -> service.confirmInGame(nonce, alice));
	}

	@Test
	void boundsTheNumberOfOpenPairings() throws Exception {
		for (int i = 0; i < 8; i++) {
			service.start();
		}
		assertEquals("too_many_pairings", code(assertThrows(PairingService.PairingException.class, service::start)));
		clock.advance(Duration.ofMinutes(10));
		service.start();
	}

	@Test
	void normalizesTypedCodes() {
		assertEquals("ABCD2345", PairingService.normalizeCode("abcd-2345").orElseThrow());
		assertEquals("ABCD2345", PairingService.normalizeCode("EDEN ABCD-2345").orElseThrow());
		assertTrue(PairingService.normalizeCode("ABCD234O").isEmpty(), "ambiguous letters are not part of the alphabet");
		assertTrue(PairingService.normalizeCode("ABC").isEmpty());
		assertTrue(PairingService.normalizeCode("x".repeat(100)).isEmpty());
	}
}
