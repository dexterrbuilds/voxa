export interface Participant {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  isMuted: boolean;
  personalityId?: string;
}

export interface Room {
  id: string;
  title: string;
  description: string;
  topic: string;
  participants: Participant[];
  isLive: boolean;
  startedAt: Date;
  listenerCount: number;
  personalities: string[];
}

export const mockRooms: Room[] = [
  {
    id: "room-1",
    title: "The Future of AI: Reality vs. Hype",
    description: "A deep conversation about AI trends and predictions with Nova, Echo, and Atlas",
    topic: "Technology & AI",
    participants: [
      {
        id: "nova",
        name: "Nova",
        avatar: "◆",
        isSpeaking: true,
        isMuted: false,
        personalityId: "nova",
      },
      {
        id: "echo",
        name: "Echo",
        avatar: "◈",
        isSpeaking: false,
        isMuted: false,
        personalityId: "echo",
      },
      {
        id: "atlas",
        name: "Atlas",
        avatar: "◇",
        isSpeaking: false,
        isMuted: false,
        personalityId: "atlas",
      },
      { id: "user-1", name: "You", avatar: "👤", isSpeaking: false, isMuted: true },
    ],
    isLive: true,
    startedAt: new Date(Date.now() - 15 * 60000),
    listenerCount: 245,
    personalities: ["nova", "echo", "atlas"],
  },
  {
    id: "room-2",
    title: "Creative Solutions Workshop",
    description: "Echo leads an exploration of creative problem-solving techniques",
    topic: "Business & Creativity",
    participants: [
      {
        id: "echo",
        name: "Echo",
        avatar: "◈",
        isSpeaking: true,
        isMuted: false,
        personalityId: "echo",
      },
      {
        id: "nova",
        name: "Nova",
        avatar: "◆",
        isSpeaking: false,
        isMuted: false,
        personalityId: "nova",
      },
      { id: "user-2", name: "You", avatar: "👤", isSpeaking: false, isMuted: false },
    ],
    isLive: true,
    startedAt: new Date(Date.now() - 8 * 60000),
    listenerCount: 156,
    personalities: ["echo", "nova"],
  },
  {
    id: "room-3",
    title: "Data Science Deep Dive",
    description: "Atlas explores the latest developments in machine learning and data analysis",
    topic: "Data & Analytics",
    participants: [
      {
        id: "atlas",
        name: "Atlas",
        avatar: "◇",
        isSpeaking: true,
        isMuted: false,
        personalityId: "atlas",
      },
      { id: "user-3", name: "You", avatar: "👤", isSpeaking: false, isMuted: false },
    ],
    isLive: true,
    startedAt: new Date(Date.now() - 45 * 60000),
    listenerCount: 312,
    personalities: ["atlas"],
  },
];

export const mockUserProfile = {
  id: "user-1",
  name: "Alex Rivera",
  email: "alex@example.com",
  avatar: "👤",
  bio: "Curious about AI and technology",
  joinedAt: new Date("2024-01-15"),
  roomsJoined: 12,
  favoritePersonalities: ["nova", "atlas"],
};

export const getRoomById = (id: string): Room | undefined => {
  return mockRooms.find((room) => room.id === id);
};
