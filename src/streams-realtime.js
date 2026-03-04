/**
 * Real-time Streams Data Module
 * Integrates Deezer/Twitch APIs for live stream percentage updates
 * Uses WebSocket/API polling pattern with useState-like state management
 */

(function() {
    'use strict';

    const StreamsRealtime = {
        // State management (useState pattern)
        state: {
            activeMatches: new Map(), // matchId -> { song1Id, song2Id, streams1, streams2, lastUpdate }
            pollingIntervals: new Map(), // matchId -> intervalId
            websocketConnections: new Map(), // matchId -> WebSocket
            errorCount: 0,
            maxErrors: 5,
            pollingInterval: 5000, // 5 seconds
            websocketEnabled: false,
            apiEndpoints: {
                deezer: 'https://api.deezer.com',
                twitch: null, // TODO: Add Twitch API endpoint
                backend: window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com'
            }
        },

        /**
         * Initialize real-time streams tracking for a match
         * @param {string} matchId - Match identifier
         * @param {object} song1 - First song { id, name, artist }
         * @param {object} song2 - Second song { id, name, artist }
         * @param {function} onUpdate - Callback (streams1, streams2, percentages) => void
         */
        async startTracking(matchId, song1, song2, onUpdate) {
            if (!matchId || !song1 || !song2) {
                console.error('[streams-realtime] Invalid parameters for startTracking');
                return;
            }

            // Initialize state for this match
            this.state.activeMatches.set(matchId, {
                song1Id: song1.id,
                song2Id: song2.id,
                song1Name: song1.name,
                song2Name: song2.name,
                streams1: 0,
                streams2: 0,
                percentage1: 50,
                percentage2: 50,
                lastUpdate: Date.now(),
                onUpdate: onUpdate || (() => {})
            });

            // Try WebSocket first, fallback to polling
            if (this.state.websocketEnabled) {
                await this.connectWebSocket(matchId);
            } else {
                this.startPolling(matchId);
            }

            console.log(`[streams-realtime] Started tracking match ${matchId}`);
        },

        /**
         * Stop tracking streams for a match
         */
        stopTracking(matchId) {
            // Clear polling interval
            const intervalId = this.state.pollingIntervals.get(matchId);
            if (intervalId) {
                clearInterval(intervalId);
                this.state.pollingIntervals.delete(matchId);
            }

            // Close WebSocket connection
            const ws = this.state.websocketConnections.get(matchId);
            if (ws) {
                ws.close();
                this.state.websocketConnections.delete(matchId);
            }

            // Remove from active matches
            this.state.activeMatches.delete(matchId);
            console.log(`[streams-realtime] Stopped tracking match ${matchId}`);
        },

        /**
         * Connect WebSocket for real-time updates
         */
        async connectWebSocket(matchId) {
            try {
                const matchState = this.state.activeMatches.get(matchId);
                if (!matchState) return;

                // TODO: Implement WebSocket endpoint
                // For now, fallback to polling
                this.startPolling(matchId);
            } catch (error) {
                console.error('[streams-realtime] WebSocket connection failed:', error);
                this.startPolling(matchId); // Fallback to polling
            }
        },

        /**
         * Start API polling for stream updates
         */
        startPolling(matchId) {
            const matchState = this.state.activeMatches.get(matchId);
            if (!matchState) return;

            // Immediate first fetch
            this.fetchStreamsData(matchId);

            // Set up polling interval
            const intervalId = setInterval(() => {
                this.fetchStreamsData(matchId);
            }, this.state.pollingInterval);

            this.state.pollingIntervals.set(matchId, intervalId);
        },

        /**
         * Fetch current stream data from APIs
         */
        async fetchStreamsData(matchId) {
            const matchState = this.state.activeMatches.get(matchId);
            if (!matchState) return;

            try {
                // Fetch from multiple sources in parallel
                const [deezer1, deezer2, backend] = await Promise.allSettled([
                    this.fetchDeezerStreams(matchState.song1Id),
                    this.fetchDeezerStreams(matchState.song2Id),
                    this.fetchBackendStreams(matchId)
                ]);

                // Process results with priority: backend > deezer
                let streams1 = matchState.streams1;
                let streams2 = matchState.streams2;

                if (backend.status === 'fulfilled' && backend.value) {
                    streams1 = backend.value.streams1 || streams1;
                    streams2 = backend.value.streams2 || streams2;
                } else {
                    if (deezer1.status === 'fulfilled' && deezer1.value) {
                        streams1 = deezer1.value;
                    }
                    if (deezer2.status === 'fulfilled' && deezer2.value) {
                        streams2 = deezer2.value;
                    }
                }

                // Calculate percentages
                const totalStreams = streams1 + streams2;
                const percentage1 = totalStreams > 0 ? (streams1 / totalStreams) * 100 : 50;
                const percentage2 = totalStreams > 0 ? (streams2 / totalStreams) * 100 : 50;

                // Update state
                matchState.streams1 = streams1;
                matchState.streams2 = streams2;
                matchState.percentage1 = percentage1;
                matchState.percentage2 = percentage2;
                matchState.lastUpdate = Date.now();
                this.state.errorCount = 0; // Reset error count on success

                // Trigger update callback
                if (matchState.onUpdate) {
                    matchState.onUpdate(streams1, streams2, percentage1, percentage2);
                }

            } catch (error) {
                console.error(`[streams-realtime] Error fetching streams for match ${matchId}:`, error);
                this.state.errorCount++;
                
                if (this.state.errorCount >= this.state.maxErrors) {
                    console.warn('[streams-realtime] Max errors reached, stopping polling');
                    this.stopTracking(matchId);
                }
            }
        },

        /**
         * Fetch stream count from Deezer API
         */
        async fetchDeezerStreams(songId) {
            try {
                // Use Deezer search API to find track
                const response = await fetch(
                    `${this.state.apiEndpoints.deezer}/track/${songId}?output=json`,
                    { 
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(3000) // 3s timeout
                    }
                );

                if (!response.ok) {
                    throw new Error(`Deezer API error: ${response.status}`);
                }

                const data = await response.json();
                return data.nb_plays || 0;
            } catch (error) {
                console.warn(`[streams-realtime] Deezer fetch failed for song ${songId}:`, error.message);
                return null;
            }
        },

        /**
         * Fetch stream data from backend API
         */
        async fetchBackendStreams(matchId) {
            try {
                const backendUrl = `${this.state.apiEndpoints.backend}/api/matches/${matchId}/streams`;
                const response = await fetch(backendUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(10000) // 10s timeout (aumentado de 5s)
                });

                if (!response.ok) {
                    throw new Error(`Backend API error: ${response.status}`);
                }

                const data = await response.json();
                return {
                    streams1: data.player1_streams || 0,
                    streams2: data.player2_streams || 0
                };
            } catch (error) {
                console.warn(`[streams-realtime] Backend fetch failed for match ${matchId}:`, error.message);
                return null;
            }
        },

        /**
         * Get current stream percentages for a match
         */
        getStreamPercentages(matchId) {
            const matchState = this.state.activeMatches.get(matchId);
            if (!matchState) {
                return { percentage1: 50, percentage2: 50, streams1: 0, streams2: 0 };
            }

            return {
                percentage1: matchState.percentage1,
                percentage2: matchState.percentage2,
                streams1: matchState.streams1,
                streams2: matchState.streams2,
                lastUpdate: matchState.lastUpdate
            };
        },

        /**
         * Determine winner based on stream percentages
         */
        determineWinner(matchId) {
            const matchState = this.state.activeMatches.get(matchId);
            if (!matchState) {
                return null;
            }

            // Winner is the song with higher percentage
            if (matchState.percentage1 > matchState.percentage2) {
                return 1; // Player 1 wins
            } else if (matchState.percentage2 > matchState.percentage1) {
                return 2; // Player 2 wins
            } else {
                // Tie - use streams count as tiebreaker
                if (matchState.streams1 > matchState.streams2) return 1;
                if (matchState.streams2 > matchState.streams1) return 2;
                return null; // True tie
            }
        },

        /**
         * Cleanup all tracking
         */
        cleanup() {
            const matchIds = Array.from(this.state.activeMatches.keys());
            matchIds.forEach(matchId => this.stopTracking(matchId));
            console.log('[streams-realtime] Cleanup completed');
        }
    };

    // Export to window
    window.StreamsRealtime = StreamsRealtime;

    // Auto-cleanup on page unload
    window.addEventListener('beforeunload', () => {
        StreamsRealtime.cleanup();
    });

    console.log('[streams-realtime] Module loaded');
})();
