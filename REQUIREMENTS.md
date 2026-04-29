# Client/Server Gameplay Requirements

## Server-side card play validation (`play_cards`)

The server must validate in this exact order:

1. Turn ownership (`NOT_TURN`)
2. Card ownership (`CARD_NOT_OWNED`)
3. Combination validity using `analyze(cards)` (`INVALID_COMBO`)
4. Beating previous play using `canBeat(a, b)` (`CANNOT_BEAT`)

Only when all validations pass, the server should:

- Remove played cards from the player's hand.
- Update trick state.
- Broadcast `card_played`.
- Broadcast `turn_changed`.

## Client-side error UX

Clients must show gameplay errors in a persistent status area (UI banner/state panel), not with `alert()` popups.
