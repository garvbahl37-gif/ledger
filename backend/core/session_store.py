"""
Session Store
==============
In-memory session registry with SQLite persistence.
Manages active Ledger instances keyed by session_id.
"""
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from core.ledger import Ledger


class SessionStore:
    """
    Thread-safe in-memory session store with optional SQLite persistence.
    Each session holds one Ledger instance.
    """

    # A0 attaches the whole cleaned DataFrame to its ledger as _cleaned_df, and
    # nothing ever detached it, so every session held its table in memory for the
    # full TTL. Seven uploads in one process — one of them 659,087 rows — was
    # enough to exhaust a 512MB instance and have it restarted mid-analysis.
    #
    # The frame is only needed while the pipeline runs and by the SQL and chat
    # endpoints afterwards, which are almost always used against the session just
    # finished. So the most recent few keep their table and older ones give it up;
    # their ledger, report and exports are untouched, because those never read the
    # frame again.
    MAX_RESIDENT_FRAMES = 2

    def __init__(self, ttl_hours: int = 24):
        self._sessions: Dict[str, Ledger] = {}
        self._created_at: Dict[str, datetime] = {}
        self._recent: List[str] = []          # most-recently-touched last
        self._ttl = timedelta(hours=ttl_hours)

    def create(self) -> Ledger:
        session_id = str(uuid.uuid4())
        ledger = Ledger(session_id=session_id)
        self._sessions[session_id] = ledger
        self._created_at[session_id] = datetime.utcnow()
        self._touch(session_id)
        return ledger

    def get(self, session_id: str) -> Optional[Ledger]:
        self._evict_expired()
        return self._sessions.get(session_id)

    def update(self, ledger: Ledger) -> None:
        self._sessions[ledger.session_id] = ledger
        self._touch(ledger.session_id)

    def _touch(self, session_id: str) -> None:
        """Mark a session as most recently used and release older tables."""
        if session_id in self._recent:
            self._recent.remove(session_id)
        self._recent.append(session_id)
        for stale in self._recent[:-self.MAX_RESIDENT_FRAMES]:
            ledger = self._sessions.get(stale)
            if ledger is not None and getattr(ledger, "_cleaned_df", None) is not None:
                ledger._cleaned_df = None

    def holds_dataframe(self, session_id: str) -> bool:
        ledger = self._sessions.get(session_id)
        return ledger is not None and getattr(ledger, "_cleaned_df", None) is not None

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._created_at.pop(session_id, None)
        if session_id in self._recent:
            self._recent.remove(session_id)

    def list_sessions(self) -> list:
        self._evict_expired()
        return [
            {
                "session_id": sid,
                "stage": ledger.current_stage.value,
                "created_at": self._created_at.get(sid, datetime.utcnow()).isoformat(),
                "hypothesis_count": len(ledger.hypotheses),
            }
            for sid, ledger in self._sessions.items()
        ]

    def _evict_expired(self) -> None:
        now = datetime.utcnow()
        expired = [
            sid
            for sid, ts in self._created_at.items()
            if now - ts > self._ttl
        ]
        for sid in expired:
            self.delete(sid)


# Global singleton
session_store = SessionStore()
