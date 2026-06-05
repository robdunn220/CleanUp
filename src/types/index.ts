export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

export type CleanupEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location_name: string;
  latitude: number;
  longitude: number;
  created_by: string;
  max_attendees: number | null;
  created_at: string;
  profiles?: Profile;
  event_attendees?: { count: number }[];
  distance?: number;
  is_attending?: boolean;
};

export type Message = {
  id: string;
  event_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
};

export type EventAttendee = {
  event_id: string;
  user_id: string;
  joined_at: string;
};
