// ============================================================================
// RETROFOOT - Transfer Routes
// ============================================================================

import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { saves, teams, players, transferListings, transferOffers } from '@retrofoot/db/schema';
import { createAuth } from '../lib/auth';
import type { Env } from '../index';
import {
  getMarketPlayers,
  getFreeAgents,
  getTeamListings,
  getTeamOffers,
  listPlayerForSale,
  getReleaseFeeQuote,
  releasePlayerToFreeAgency,
  removePlayerListing,
  makeOffer,
  respondToOffer,
  acceptCounterOffer,
  completeTransfer,
  negotiateTransfer,
  negotiateIncomingOffer,
} from '../services/transfer.service';

export const transferRoutes = new Hono<{ Bindings: Env }>();


/**
 * POST /transfer/negotiate/:saveId
 * Live negotiation endpoint for buying players
 * Handles entire negotiation with max 2 counter rounds
 */
transferRoutes.post('/negotiate/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{
    playerId: string;
    fromTeamId: string | null;
    offer: { fee: number; wage: number; years: number };
    negotiationId?: string;
    action?: 'counter' | 'accept' | 'walkaway';
  }>();

  // Validate required fields
  if (!body.playerId) {
    return c.json({ error: 'playerId is required' }, 400);
  }

  if (!body.offer || body.offer.fee === undefined || body.offer.wage === undefined || !body.offer.years) {
    return c.json({ error: 'offer with fee, wage, and years is required' }, 400);
  }

  if (body.offer.fee < 0) {
    return c.json({ error: 'Fee cannot be negative' }, 400);
  }

  if (body.offer.fee > 1_000_000_000) {
    return c.json({ error: 'Fee exceeds maximum allowed (1 billion)' }, 400);
  }

  if (body.offer.wage < 0) {
    return c.json({ error: 'Wage cannot be negative' }, 400);
  }

  if (body.offer.wage > 10_000_000) {
    return c.json({ error: 'Wage exceeds maximum allowed (10 million/week)' }, 400);
  }

  if (body.offer.years < 1 || body.offer.years > 5) {
    return c.json({ error: 'Contract years must be between 1 and 5' }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await negotiateTransfer(
      db,
      c.env.DB,
      saveId,
      body.playerId,
      body.fromTeamId,
      ownership.playerTeamId,
      body.offer,
      body.negotiationId,
      body.action,
    );

    return c.json(result);
  } catch (error) {
    console.error('Failed to negotiate transfer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to negotiate';
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /transfer/negotiate-incoming/:saveId/:offerId
 * Respond to incoming AI offers on player's listed players
 */
transferRoutes.post('/negotiate-incoming/:saveId/:offerId', async (c) => {
  const saveId = c.req.param('saveId');
  const offerId = c.req.param('offerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{
    action: 'accept' | 'reject' | 'counter';
    counterOffer?: { fee: number };
    negotiationId?: string;
  }>();

  if (!body.action || !['accept', 'reject', 'counter'].includes(body.action)) {
    return c.json({ error: 'Invalid action' }, 400);
  }

  if (body.action === 'counter' && !body.counterOffer) {
    return c.json({ error: 'Counter action requires counterOffer with fee' }, 400);
  }

  if (body.counterOffer) {
    if (body.counterOffer.fee < 0) {
      return c.json({ error: 'Counter fee cannot be negative' }, 400);
    }
    if (body.counterOffer.fee > 1_000_000_000) {
      return c.json({ error: 'Counter fee exceeds maximum allowed (1 billion)' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await negotiateIncomingOffer(
      db,
      c.env.DB,
      saveId,
      offerId,
      body.action,
      body.counterOffer,
      body.negotiationId,
    );

    return c.json(result);
  } catch (error) {
    console.error('Failed to negotiate incoming offer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to negotiate';
    return c.json({ error: message }, 400);
  }
});

// Helper to verify save ownership
async function verifySaveOwnership(
  c: Context<{ Bindings: Env }>,
  saveId: string,
): Promise<{ userId: string; playerTeamId: string } | null> {
  const auth = createAuth(c.env, {
    url: c.req.url,
    headers: c.req.raw.headers,
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user?.id) {
    return null;
  }

  const db = drizzle(c.env.DB);
  const saveResult = await db
    .select({ userId: saves.userId, playerTeamId: saves.playerTeamId })
    .from(saves)
    .where(eq(saves.id, saveId))
    .limit(1);

  if (saveResult.length === 0 || saveResult[0].userId !== session.user.id) {
    return null;
  }

  return { userId: session.user.id, playerTeamId: saveResult[0].playerTeamId };
}

/**
 * GET /transfer/market/:saveId
 * Get all available players in the transfer market
 */
transferRoutes.get('/market/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    // Get listed players (excluding player's team) and free agents
    const [listed, freeAgents] = await Promise.all([
      getMarketPlayers(db, saveId, ownership.playerTeamId),
      getFreeAgents(db, saveId),
    ]);

    return c.json({
      listed,
      freeAgents,
      total: listed.length + freeAgents.length,
    });
  } catch (error) {
    console.error('Failed to get market players:', error);
    return c.json({ error: 'Failed to get market players' }, 500);
  }
});

/**
 * GET /transfer/diagnostics/:saveId
 * Debug market behavior for balancing and QA
 */
transferRoutes.get('/diagnostics/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    const saveResult = await db
      .select({ currentRound: saves.currentRound })
      .from(saves)
      .where(eq(saves.id, saveId))
      .limit(1);

    const currentRound = saveResult[0]?.currentRound || 1;

    const aiTeamRows = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.saveId, saveId), ne(teams.id, ownership.playerTeamId)));
    const aiTeamIds = aiTeamRows.map((row) => row.id);

    const listings = await db
      .select({
        playerId: transferListings.playerId,
        listedRound: transferListings.listedRound,
      })
      .from(transferListings)
      .where(eq(transferListings.saveId, saveId));

    const listingPlayerIds = listings.map((listing) => listing.playerId);
    const listingPlayers =
      listingPlayerIds.length > 0
        ? await db
            .select({
              id: players.id,
              age: players.age,
            })
            .from(players)
            .where(and(eq(players.saveId, saveId), inArray(players.id, listingPlayerIds)))
        : [];

    const listingAgeByPlayerId = new Map(
      listingPlayers.map((player) => [player.id, player.age]),
    );

    const activeListingsByAgeBucket = {
      under24: 0,
      from24To29: 0,
      age30plus: 0,
      unknown: 0,
    };

    const listingDurationBuckets = {
      lessThan3Rounds: 0,
      from3To6Rounds: 0,
      over6Rounds: 0,
    };

    for (const listing of listings) {
      const age = listingAgeByPlayerId.get(listing.playerId);
      if (age === undefined) {
        activeListingsByAgeBucket.unknown++;
      } else if (age < 24) {
        activeListingsByAgeBucket.under24++;
      } else if (age < 30) {
        activeListingsByAgeBucket.from24To29++;
      } else {
        activeListingsByAgeBucket.age30plus++;
      }

      const listedForRounds = Math.max(0, currentRound - listing.listedRound);
      if (listedForRounds < 3) {
        listingDurationBuckets.lessThan3Rounds++;
      } else if (listedForRounds <= 6) {
        listingDurationBuckets.from3To6Rounds++;
      } else {
        listingDurationBuckets.over6Rounds++;
      }
    }

    const allOffers = await db
      .select({
        status: transferOffers.status,
        fromTeamId: transferOffers.fromTeamId,
        respondedRound: transferOffers.respondedRound,
      })
      .from(transferOffers)
      .where(eq(transferOffers.saveId, saveId));

    const offerStatusCounts = {
      pending: 0,
      counter: 0,
      expired: 0,
      completed: 0,
      rejected: 0,
      accepted: 0,
      cancelled: 0,
      other: 0,
    };

    let aiOfferResponses = 0;
    let aiAutoCompletedTransfers = 0;
    let aiRejectedOffers = 0;
    let aiCounterOffers = 0;

    const aiTeamIdSet = new Set(aiTeamIds);

    for (const offer of allOffers) {
      if (offer.status in offerStatusCounts) {
        const key = offer.status as keyof typeof offerStatusCounts;
        offerStatusCounts[key] += 1;
      } else {
        offerStatusCounts.other += 1;
      }

      const isAIResponse =
        offer.fromTeamId !== null &&
        aiTeamIdSet.has(offer.fromTeamId) &&
        offer.respondedRound === currentRound;

      if (!isAIResponse) continue;

      aiOfferResponses++;
      if (offer.status === 'completed') aiAutoCompletedTransfers++;
      if (offer.status === 'rejected') aiRejectedOffers++;
      if (offer.status === 'counter') aiCounterOffers++;
    }

    return c.json({
      currentRound,
      activeListingsByAgeBucket,
      listingDurationBuckets,
      offerStatusCounts,
      aiResponseCountsLastRound: {
        aiOfferResponses,
        aiAutoCompletedTransfers,
        aiRejectedOffers,
        aiCounterOffers,
      },
    });
  } catch (error) {
    console.error('Failed to get transfer diagnostics:', error);
    return c.json({ error: 'Failed to get transfer diagnostics' }, 500);
  }
});

/**
 * GET /transfer/listings/:saveId/:teamId
 * Get a team's listed players
 */
transferRoutes.get('/listings/:saveId/:teamId', async (c) => {
  const saveId = c.req.param('saveId');
  const teamId = c.req.param('teamId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Verify user can only access their own team's listings
  if (teamId !== ownership.playerTeamId) {
    return c.json(
      { error: 'Unauthorized: Can only view your own team listings' },
      403,
    );
  }

  const db = drizzle(c.env.DB);

  try {
    const listings = await getTeamListings(db, saveId, teamId);
    return c.json({ listings });
  } catch (error) {
    console.error('Failed to get team listings:', error);
    return c.json({ error: 'Failed to get team listings' }, 500);
  }
});

/**
 * POST /transfer/list/:saveId
 * List a player for sale
 */
transferRoutes.post('/list/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{
    playerId: string;
    askingPrice?: number;
  }>();

  if (!body.playerId) {
    return c.json({ error: 'playerId is required' }, 400);
  }

  if (body.askingPrice !== undefined && body.askingPrice < 0) {
    return c.json({ error: 'Asking price cannot be negative' }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await listPlayerForSale(
      db,
      saveId,
      body.playerId,
      ownership.playerTeamId,
      body.askingPrice,
    );

    return c.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to list player:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to list player';
    return c.json({ error: message }, 400);
  }
});

/**
 * DELETE /transfer/list/:saveId/:playerId
 * Remove a player listing
 */
transferRoutes.delete('/list/:saveId/:playerId', async (c) => {
  const saveId = c.req.param('saveId');
  const playerId = c.req.param('playerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    await removePlayerListing(db, saveId, playerId, ownership.playerTeamId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to remove listing:', error);
    return c.json({ error: 'Failed to remove listing' }, 500);
  }
});

/**
 * GET /transfer/release-fee/:saveId/:playerId
 * Get release compensation quote
 */
transferRoutes.get('/release-fee/:saveId/:playerId', async (c) => {
  const saveId = c.req.param('saveId');
  const playerId = c.req.param('playerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    const quote = await getReleaseFeeQuote(
      db,
      saveId,
      playerId,
      ownership.playerTeamId,
    );
    return c.json(quote);
  } catch (error) {
    console.error('Failed to get release quote:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to get release quote';
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /transfer/release/:saveId
 * Release a player to free agency
 */
transferRoutes.post('/release/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{ playerId: string }>();
  if (!body.playerId) {
    return c.json({ error: 'playerId is required' }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const released = await releasePlayerToFreeAgency(
      db,
      saveId,
      body.playerId,
      ownership.playerTeamId,
    );
    return c.json({ success: true, ...released });
  } catch (error) {
    console.error('Failed to release player:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to release player';
    return c.json({ error: message }, 400);
  }
});

/**
 * GET /transfer/offers/:saveId/:teamId
 * Get active offers for a team
 */
transferRoutes.get('/offers/:saveId/:teamId', async (c) => {
  const saveId = c.req.param('saveId');
  const teamId = c.req.param('teamId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Verify user can only access their own team's offers
  if (teamId !== ownership.playerTeamId) {
    return c.json(
      { error: 'Unauthorized: Can only view your own team offers' },
      403,
    );
  }

  const db = drizzle(c.env.DB);

  try {
    const offers = await getTeamOffers(db, saveId, teamId);
    return c.json(offers);
  } catch (error) {
    console.error('Failed to get offers:', error);
    return c.json({ error: 'Failed to get offers' }, 500);
  }
});

/**
 * POST /transfer/offer/:saveId
 * Make an offer for a player
 */
transferRoutes.post('/offer/:saveId', async (c) => {
  const saveId = c.req.param('saveId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{
    playerId: string;
    fromTeamId: string | null;
    offerAmount: number;
    offeredWage: number;
    contractYears: number;
  }>();

  if (
    !body.playerId ||
    body.offerAmount === undefined ||
    body.offeredWage === undefined ||
    !body.contractYears
  ) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  if (body.offerAmount < 0) {
    return c.json({ error: 'Offer amount cannot be negative' }, 400);
  }

  if (body.offerAmount > 1_000_000_000) {
    return c.json({ error: 'Offer amount exceeds maximum allowed (1 billion)' }, 400);
  }

  if (body.offeredWage < 0) {
    return c.json({ error: 'Offered wage cannot be negative' }, 400);
  }

  if (body.offeredWage > 10_000_000) {
    return c.json({ error: 'Offered wage exceeds maximum allowed (10 million/week)' }, 400);
  }

  if (body.contractYears < 1 || body.contractYears > 5) {
    return c.json({ error: 'Contract years must be between 1 and 5' }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await makeOffer(
      db,
      saveId,
      body.playerId,
      body.fromTeamId,
      ownership.playerTeamId,
      body.offerAmount,
      body.offeredWage,
      body.contractYears,
    );

    return c.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to make offer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to make offer';
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /transfer/offer/:saveId/:offerId/respond
 * Respond to an offer (accept/reject/counter)
 */
transferRoutes.post('/offer/:saveId/:offerId/respond', async (c) => {
  const saveId = c.req.param('saveId');
  const offerId = c.req.param('offerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const body = await c.req.json<{
    response: 'accept' | 'reject' | 'counter';
    counterAmount?: number;
    counterWage?: number;
  }>();

  if (
    !body.response ||
    !['accept', 'reject', 'counter'].includes(body.response)
  ) {
    return c.json({ error: 'Invalid response' }, 400);
  }

  if (
    body.response === 'counter' &&
    (body.counterAmount === undefined || body.counterWage === undefined)
  ) {
    return c.json(
      { error: 'Counter offer requires counterAmount and counterWage' },
      400,
    );
  }

  if (body.response === 'counter') {
    if (body.counterAmount !== undefined && body.counterAmount < 0) {
      return c.json({ error: 'Counter amount cannot be negative' }, 400);
    }
    if (body.counterAmount !== undefined && body.counterAmount > 1_000_000_000) {
      return c.json({ error: 'Counter amount exceeds maximum allowed (1 billion)' }, 400);
    }
    if (body.counterWage !== undefined && body.counterWage < 0) {
      return c.json({ error: 'Counter wage cannot be negative' }, 400);
    }
    if (body.counterWage !== undefined && body.counterWage > 10_000_000) {
      return c.json({ error: 'Counter wage exceeds maximum allowed (10 million/week)' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await respondToOffer(
      db,
      c.env.DB,
      saveId,
      offerId,
      body.response,
      body.counterAmount,
      body.counterWage,
    );

    return c.json({ success: true, autoCompleted: result.autoCompleted });
  } catch (error) {
    console.error('Failed to respond to offer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to respond';
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /transfer/offer/:saveId/:offerId/accept-counter
 * Accept a counter offer
 */
transferRoutes.post('/offer/:saveId/:offerId/accept-counter', async (c) => {
  const saveId = c.req.param('saveId');
  const offerId = c.req.param('offerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    await acceptCounterOffer(db, saveId, offerId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to accept counter offer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to accept counter';
    return c.json({ error: message }, 400);
  }
});

/**
 * POST /transfer/complete/:saveId/:offerId
 * Complete an accepted transfer
 */
transferRoutes.post('/complete/:saveId/:offerId', async (c) => {
  const saveId = c.req.param('saveId');
  const offerId = c.req.param('offerId');
  const ownership = await verifySaveOwnership(c, saveId);

  if (!ownership) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const db = drizzle(c.env.DB);

  try {
    const result = await completeTransfer(db, c.env.DB, saveId, offerId);
    return c.json(result);
  } catch (error) {
    console.error('Failed to complete transfer:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to complete transfer';
    return c.json({ error: message }, 400);
  }
});
