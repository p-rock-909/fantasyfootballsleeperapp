"""
Google Calendar integration for MBIE Phase 2 - daily context awareness and event preparation.

Integrates with Google Calendar API to provide business context intelligence
for improved search relevance and proactive content suggestions.

@see memory-bank/features/mbie-intelligence/phase2-design.md#calendar-integration-intelligence
@navigation Use startHere.md → "🧠 Memory-Bank Intelligence Engine (MBIE)" path for context
@feature_docs memory-bank/features/mbie-intelligence/README.md
"""

import logging
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Optional, Any
import json
import re

# Optional Google Calendar API imports
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    GOOGLE_CALENDAR_AVAILABLE = True
except ImportError:
    GOOGLE_CALENDAR_AVAILABLE = False


logger = logging.getLogger(__name__)


@dataclass
class CalendarEvent:
    """Individual calendar event with business intelligence"""
    
    event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    attendees: List[str]
    location: Optional[str]
    description: Optional[str]
    business_relevance: float  # 0.0-1.0 relevance to current business focus
    client_related: bool
    preparation_needed: bool
    energy_requirement: str  # "high", "medium", "low"


@dataclass
class TimeBlock:
    """Calendar time block analysis"""
    
    start_time: datetime
    end_time: datetime
    block_type: str  # "meeting", "focus", "break", "travel"
    energy_level: str  # "high", "medium", "low"
    availability: str  # "busy", "tentative", "free"


@dataclass
class CalendarContext:
    """Comprehensive calendar context for business intelligence"""
    
    current_events: List[CalendarEvent]
    upcoming_events: List[CalendarEvent]
    time_blocks: List[TimeBlock]
    energy_pattern: str  # "morning_focused", "afternoon_focused", "evening_focused"
    daily_focus_time: int  # minutes of focused work time available
    client_time_percentage: float  # percentage of time dedicated to client work
    preparation_alerts: List[Dict[str, Any]]  # events needing preparation


class GoogleCalendarIntegration:
    """Google Calendar API integration for business context awareness"""
    
    SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
    
    def __init__(self, config: dict):
        self.config = config.get('google_calendar', {})
        self.enabled = self.config.get('enabled', False) and GOOGLE_CALENDAR_AVAILABLE
        self.credentials_path = self.config.get('credentials_path', '~/.config/mbie/google_credentials.json')
        self.timezone = self.config.get('timezone', 'America/New_York')
        self.context_window_days = self.config.get('context_window_days', 7)
        
        self.service = None
        self.client_keywords = ['andrew', 'client', 'sprint', 'meeting', 'consultation']
        self.preparation_keywords = ['sprint', 'presentation', 'review', 'planning']
        
        if self.enabled:
            self._authenticate()
            
    def _authenticate(self):
        """Authenticate with Google Calendar API"""
        if not GOOGLE_CALENDAR_AVAILABLE:
            logger.warning("Google Calendar API not available. Install google-api-python-client.")
            self.enabled = False
            return
            
        try:
            creds = None
            credentials_path = Path(self.credentials_path).expanduser()
            token_path = credentials_path.parent / "token.json"
            
            # Load existing token
            if token_path.exists():
                creds = Credentials.from_authorized_user_file(str(token_path), self.SCOPES)
                
            # If no valid credentials, authenticate
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    if credentials_path.exists():
                        flow = InstalledAppFlow.from_client_secrets_file(
                            str(credentials_path), self.SCOPES)
                        creds = flow.run_local_server(port=0)
                    else:
                        logger.error(f"Google Calendar credentials not found at {credentials_path}")
                        self.enabled = False
                        return
                        
                # Save credentials for next run
                with open(token_path, 'w') as token:
                    token.write(creds.to_json())
                    
            self.service = build('calendar', 'v3', credentials=creds)
            logger.info("Google Calendar integration initialized successfully")
            
        except (FileNotFoundError, ValueError, OSError) as e:
            logger.error(f"Failed to authenticate with Google Calendar: {e}")
            self.enabled = False
        except Exception as e:
            logger.error(f"Unexpected error during Google Calendar authentication: {e}")
            self.enabled = False
            
    def get_daily_context(self, date: datetime = None) -> CalendarContext:
        """Get comprehensive calendar context for specified date"""
        
        if not self.enabled:
            return self._get_mock_context()
            
        if date is None:
            date = datetime.now()
            
        try:
            # Get events for the day
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)
            
            current_events = self._get_events_in_range(start_of_day, end_of_day)
            
            # Get upcoming events (next week)
            upcoming_start = end_of_day + timedelta(seconds=1)
            upcoming_end = upcoming_start + timedelta(days=self.context_window_days)
            upcoming_events = self._get_events_in_range(upcoming_start, upcoming_end)
            
            # Analyze time blocks
            time_blocks = self._analyze_time_blocks(current_events, start_of_day, end_of_day)
            
            # Determine energy pattern
            energy_pattern = self._analyze_energy_pattern(current_events)
            
            # Calculate focus time
            daily_focus_time = self._calculate_focus_time(time_blocks)
            
            # Calculate client time percentage
            client_time_percentage = self._calculate_client_time_percentage(current_events)
            
            # Generate preparation alerts
            preparation_alerts = self._generate_preparation_alerts(upcoming_events)
            
            return CalendarContext(
                current_events=current_events,
                upcoming_events=upcoming_events,
                time_blocks=time_blocks,
                energy_pattern=energy_pattern,
                daily_focus_time=daily_focus_time,
                client_time_percentage=client_time_percentage,
                preparation_alerts=preparation_alerts
            )
            
        except (HttpError, ConnectionError, TimeoutError) as e:
            logger.error(f"Failed to get calendar context: {e}")
            return self._get_mock_context()
        except Exception as e:
            logger.error(f"Unexpected error getting calendar context: {e}")
            return self._get_mock_context()
            
    def _get_events_in_range(self, start_time: datetime, end_time: datetime) -> List[CalendarEvent]:
        """Get calendar events in specified time range"""
        
        try:
            # Convert to RFC3339 format
            time_min = start_time.isoformat() + 'Z'
            time_max = end_time.isoformat() + 'Z'
            
            # Call Google Calendar API
            events_result = self.service.events().list(
                calendarId='primary',
                timeMin=time_min,
                timeMax=time_max,
                maxResults=50,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            
            calendar_events = []
            for event in events:
                calendar_event = self._parse_calendar_event(event)
                if calendar_event:
                    calendar_events.append(calendar_event)
                    
            return calendar_events
            
        except HttpError as e:
            logger.error(f"Google Calendar API error: {e}")
            return []
        except Exception as e:
            logger.error(f"Failed to get events: {e}")
            return []
            
    def _parse_calendar_event(self, event: Dict) -> Optional[CalendarEvent]:
        """Parse Google Calendar event into CalendarEvent object"""
        
        try:
            # Extract basic information
            event_id = event.get('id', '')
            title = event.get('summary', 'Untitled Event')
            description = event.get('description', '')
            location = event.get('location')
            
            # Parse start/end times
            start = event.get('start', {})
            end = event.get('end', {})
            
            if 'dateTime' in start:
                start_time = datetime.fromisoformat(start['dateTime'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(end['dateTime'].replace('Z', '+00:00'))
            else:
                # All-day event
                start_time = datetime.fromisoformat(start['date'])
                end_time = datetime.fromisoformat(end['date'])
                
            # Extract attendees
            attendees = []
            for attendee in event.get('attendees', []):
                email = attendee.get('email', '')
                if email and email != 'rnguyenc@gmail.com':  # Exclude self
                    attendees.append(email)
                    
            # Analyze business relevance
            business_relevance = self._calculate_business_relevance(title, description, attendees)
            
            # Determine if client-related
            client_related = self._is_client_related(title, description, attendees)
            
            # Determine if preparation needed
            preparation_needed = self._needs_preparation(title, description)
            
            # Estimate energy requirement
            energy_requirement = self._estimate_energy_requirement(title, description, len(attendees))
            
            return CalendarEvent(
                event_id=event_id,
                title=title,
                start_time=start_time,
                end_time=end_time,
                attendees=attendees,
                location=location,
                description=description,
                business_relevance=business_relevance,
                client_related=client_related,
                preparation_needed=preparation_needed,
                energy_requirement=energy_requirement
            )
            
        except Exception as e:
            logger.error(f"Failed to parse calendar event: {e}")
            return None
            
    def _calculate_business_relevance(self, title: str, description: str, attendees: List[str]) -> float:
        """Calculate business relevance score for an event"""
        
        text = f"{title} {description}".lower()
        score = 0.0
        
        # Check for client keywords
        for keyword in self.client_keywords:
            if keyword in text:
                score += 0.3
                
        # Check for business attendees (external emails)
        external_attendees = [a for a in attendees if not a.endswith('@gmail.com')]
        if external_attendees:
            score += 0.4
            
        # Check for Randy's business terms
        business_terms = ['consulting', 'automation', 'anti-rat race', 'foundation quarter', 'sprint']
        for term in business_terms:
            if term in text:
                score += 0.2
                
        return min(1.0, score)
        
    def _is_client_related(self, title: str, description: str, attendees: List[str]) -> bool:
        """Determine if event is client-related"""
        
        text = f"{title} {description}".lower()
        
        # Check for explicit client mentions
        if 'andrew' in text or 'client' in text:
            return True
            
        # Check for business meeting indicators
        business_indicators = ['consultation', 'sprint', 'review', 'planning', 'strategy']
        return any(indicator in text for indicator in business_indicators)
        
    def _needs_preparation(self, title: str, description: str) -> bool:
        """Determine if event needs preparation"""
        
        text = f"{title} {description}".lower()
        return any(keyword in text for keyword in self.preparation_keywords)
        
    def _estimate_energy_requirement(self, title: str, description: str, attendee_count: int) -> str:
        """Estimate energy requirement for event"""
        
        text = f"{title} {description}".lower()
        
        # High-energy indicators
        high_energy_terms = ['sprint', 'presentation', 'consultation', 'workshop', 'training']
        if any(term in text for term in high_energy_terms) or attendee_count >= 3:
            return "high"
            
        # Low-energy indicators
        low_energy_terms = ['check-in', 'status', 'brief', 'quick']
        if any(term in text for term in low_energy_terms) and attendee_count <= 1:
            return "low"
            
        return "medium"
        
    def _analyze_time_blocks(self, events: List[CalendarEvent], start_time: datetime, end_time: datetime) -> List[TimeBlock]:
        """Analyze calendar for time blocks and availability"""
        
        time_blocks = []
        current_time = start_time
        
        # Sort events by start time
        sorted_events = sorted(events, key=lambda x: x.start_time)
        
        for event in sorted_events:
            # Add free time block before this event
            if current_time < event.start_time:
                duration_minutes = (event.start_time - current_time).total_seconds() / 60
                
                if duration_minutes >= 30:  # Only consider blocks >= 30 minutes
                    block_type = "focus" if duration_minutes >= 60 else "break"
                    energy_level = self._get_time_energy_level(current_time)
                    
                    time_blocks.append(TimeBlock(
                        start_time=current_time,
                        end_time=event.start_time,
                        block_type=block_type,
                        energy_level=energy_level,
                        availability="free"
                    ))
                    
            # Add meeting block
            time_blocks.append(TimeBlock(
                start_time=event.start_time,
                end_time=event.end_time,
                block_type="meeting",
                energy_level=event.energy_requirement,
                availability="busy"
            ))
            
            current_time = max(current_time, event.end_time)
            
        # Add final free block if time remains
        if current_time < end_time:
            duration_minutes = (end_time - current_time).total_seconds() / 60
            
            if duration_minutes >= 30:
                time_blocks.append(TimeBlock(
                    start_time=current_time,
                    end_time=end_time,
                    block_type="focus",
                    energy_level=self._get_time_energy_level(current_time),
                    availability="free"
                ))
                
        return time_blocks
        
    def _get_time_energy_level(self, time: datetime) -> str:
        """Get energy level based on time of day"""
        
        hour = time.hour
        
        if 6 <= hour < 10:
            return "high"  # Morning energy
        elif 10 <= hour < 14:
            return "medium"  # Late morning
        elif 14 <= hour < 16:
            return "low"  # Post-lunch dip
        elif 16 <= hour < 18:
            return "medium"  # Afternoon recovery
        else:
            return "low"  # Evening
            
    def _analyze_energy_pattern(self, events: List[CalendarEvent]) -> str:
        """Analyze daily energy pattern based on calendar"""
        
        morning_load = 0
        afternoon_load = 0
        evening_load = 0
        
        for event in events:
            hour = event.start_time.hour
            duration = (event.end_time - event.start_time).total_seconds() / 3600  # hours
            
            if 6 <= hour < 12:
                morning_load += duration
            elif 12 <= hour < 18:
                afternoon_load += duration
            else:
                evening_load += duration
                
        # Determine dominant pattern
        if morning_load >= afternoon_load and morning_load >= evening_load:
            return "morning_focused"
        elif afternoon_load >= evening_load:
            return "afternoon_focused"
        else:
            return "evening_focused"
            
    def _calculate_focus_time(self, time_blocks: List[TimeBlock]) -> int:
        """Calculate available focus time in minutes"""
        
        focus_minutes = 0
        for block in time_blocks:
            if block.block_type == "focus" and block.availability == "free":
                duration = (block.end_time - block.start_time).total_seconds() / 60
                focus_minutes += duration
                
        return int(focus_minutes)
        
    def _calculate_client_time_percentage(self, events: List[CalendarEvent]) -> float:
        """Calculate percentage of time dedicated to client work"""
        
        total_time = 0
        client_time = 0
        
        for event in events:
            duration = (event.end_time - event.start_time).total_seconds() / 3600  # hours
            total_time += duration
            
            if event.client_related:
                client_time += duration
                
        return (client_time / total_time) if total_time > 0 else 0.0
        
    def _generate_preparation_alerts(self, upcoming_events: List[CalendarEvent]) -> List[Dict[str, Any]]:
        """Generate preparation alerts for upcoming events"""
        
        alerts = []
        now = datetime.now()
        
        for event in upcoming_events:
            if event.preparation_needed:
                hours_until = (event.start_time - now).total_seconds() / 3600
                
                # Generate alert based on time until event
                if hours_until <= 24:
                    urgency = "high"
                elif hours_until <= 72:
                    urgency = "medium"
                else:
                    urgency = "low"
                    
                alerts.append({
                    "event_id": event.event_id,
                    "event_title": event.title,
                    "start_time": event.start_time.isoformat(),
                    "hours_until": hours_until,
                    "urgency": urgency,
                    "preparation_items": self._suggest_preparation_items(event)
                })
                
        return sorted(alerts, key=lambda x: x["hours_until"])
        
    def _suggest_preparation_items(self, event: CalendarEvent) -> List[str]:
        """Suggest preparation items for an event"""
        
        items = []
        text = f"{event.title} {event.description}".lower()
        
        if "sprint" in text:
            items.extend([
                "Review sprint objectives",
                "Prepare transformation materials",
                "Check risk register",
                "Gather client context"
            ])
            
        if "client" in text or "andrew" in text:
            items.extend([
                "Review client history",
                "Prepare case study materials",
                "Check previous interactions"
            ])
            
        if "presentation" in text:
            items.extend([
                "Prepare slides",
                "Test technology",
                "Rehearse content"
            ])
            
        return items[:5]  # Limit to top 5 suggestions
        
    def _get_mock_context(self) -> CalendarContext:
        """Get mock calendar context when API is not available"""
        
        now = datetime.now()
        
        # Mock current events
        mock_current = [
            CalendarEvent(
                event_id="mock_1",
                title="Focus Time - Sprint Preparation",
                start_time=now.replace(hour=9, minute=0),
                end_time=now.replace(hour=11, minute=0),
                attendees=[],
                location=None,
                description="Dedicated time for ExampleCorp sprint preparation",
                business_relevance=0.9,
                client_related=True,
                preparation_needed=True,
                energy_requirement="high"
            )
        ]
        
        # Mock upcoming events
        sprint_date = now + timedelta(days=5)  # Simulate upcoming sprint
        mock_upcoming = [
            CalendarEvent(
                event_id="mock_2",
                title="Example Client - On-Site Sprint",
                start_time=sprint_date.replace(hour=9, minute=0),
                end_time=sprint_date.replace(hour=17, minute=0),
                attendees=["andrew@client.com"],
                location="Client Office",
                description="3-day transformation sprint with ExampleCorp",
                business_relevance=1.0,
                client_related=True,
                preparation_needed=True,
                energy_requirement="high"
            )
        ]
        
        # Mock time blocks
        mock_blocks = [
            TimeBlock(
                start_time=now.replace(hour=8, minute=0),
                end_time=now.replace(hour=9, minute=0),
                block_type="focus",
                energy_level="high",
                availability="free"
            )
        ]
        
        # Mock preparation alerts
        mock_alerts = [
            {
                "event_id": "mock_2",
                "event_title": "Example Client - On-Site Sprint",
                "start_time": sprint_date.isoformat(),
                "hours_until": 120,  # 5 days
                "urgency": "high",
                "preparation_items": [
                    "Review sprint objectives",
                    "Prepare transformation materials",
                    "Check risk register"
                ]
            }
        ]
        
        return CalendarContext(
            current_events=mock_current,
            upcoming_events=mock_upcoming,
            time_blocks=mock_blocks,
            energy_pattern="morning_focused",
            daily_focus_time=180,  # 3 hours
            client_time_percentage=0.6,  # 60%
            preparation_alerts=mock_alerts
        )


def create_calendar_integration(config: dict) -> GoogleCalendarIntegration:
    """Factory function to create Google Calendar integration"""
    return GoogleCalendarIntegration(config)


if __name__ == "__main__":
    # Example usage
    import yaml
    
    # Load config
    config_path = Path(__file__).parent.parent / "config.yml"
    with open(config_path) as f:
        config = yaml.safe_load(f)
        
    # Create calendar integration
    calendar_integration = create_calendar_integration(config)
    
    # Get daily context
    context = calendar_integration.get_daily_context()
    
    print("Calendar Context:")
    print(f"Current events: {len(context.current_events)}")
    print(f"Upcoming events: {len(context.upcoming_events)}")
    print(f"Energy pattern: {context.energy_pattern}")
    print(f"Daily focus time: {context.daily_focus_time} minutes")
    print(f"Client time: {context.client_time_percentage:.1%}")
    print(f"Preparation alerts: {len(context.preparation_alerts)}")
    
    if context.preparation_alerts:
        print("\nPreparation Alerts:")
        for alert in context.preparation_alerts[:3]:
            print(f"- {alert['event_title']} in {alert['hours_until']:.1f} hours ({alert['urgency']} urgency)")