import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { MatchPage } from './pages/MatchPage';
import { SeasonSummaryPage } from './pages/SeasonSummaryPage';
import { NewGamePage } from './pages/NewGamePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { ContactPage } from './pages/ContactPage';
import { AdminPage } from './pages/AdminPage';
import { ProtectedRoute } from './components';
import { OnlineHomePage } from './online/OnlineHomePage';
import { LeagueLobbyPage } from './online/LeagueLobbyPage';
import { OnlineLeagueSeasonPage } from './online/OnlineLeagueSeasonPage';
import { OnlineMatchRoomPage } from './online/OnlineMatchRoomPage';
import { OnlineJoinInvitePage } from './online/OnlineJoinInvitePage';
import { OnlineClubPage } from './online/OnlineClubPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/online/join/:inviteCode"
          element={<OnlineJoinInvitePage />}
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/game/new" element={<NewGamePage />} />
          <Route path="/game/:saveId" element={<GamePage />} />
          <Route path="/game/:saveId/match" element={<MatchPage />} />
          <Route
            path="/game/:saveId/season-summary"
            element={<SeasonSummaryPage />}
          />
          <Route path="/online" element={<OnlineHomePage />} />
          <Route path="/online/league/:leagueId" element={<LeagueLobbyPage />} />
          <Route
            path="/online/league/:leagueId/club"
            element={<OnlineClubPage />}
          />
          <Route
            path="/online/league/:leagueId/season"
            element={<OnlineLeagueSeasonPage />}
          />
          <Route
            path="/online/league/:leagueId/match/:fixtureId"
            element={<OnlineMatchRoomPage />}
          />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
