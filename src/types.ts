export type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'PAUSED';

export interface Player {
  y: number;
  vy: number;
  width: number;
  height: number;
  isGrounded: boolean;
  jumpCount: number; // 0 = ground, 1 = first jump, 2 = double jump
  angle: number; // rotation angle for animation
  scaleX: number; // squishing animation scale
  scaleY: number; // squishing animation scale
  expression: 'HAPPY' | 'JUMPING' | 'DOUBLE_JUMP' | 'HIT' | 'BLOCKED';
  trail: { x: number; y: number; opacity: number }[];
}

export type ObstacleHeightType = 'LOW' | 'MID' | 'HIGH' | 'TALL_VERTICAL';

export interface Obstacle {
  id: string;
  x: number;
  y: number; // y coordinate of the top-left of the obstacle
  width: number;
  height: number;
  speed: number;
  heightType: ObstacleHeightType;
  beanCount: number; // 2 or 3 beans inside the pod
  colorVariation: string; // slight variance in greens
  hasPassed: boolean;
  wiggleOffset: number; // animation wiggle
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
  shape: 'circle' | 'bean' | 'star';
  spin: number;
  angle: number;
}

export interface DecorativeCloud {
  id: string;
  x: number;
  y: number;
  scale: number;
  speed: number;
  opacity: number;
}

export interface FloatingLeaf {
  id: string;
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  angle: number;
  spinSpeed: number;
  size: number;
  color: string;
}

export interface GameStats {
  score: number;
  highScore: number;
  level: number;
  obstaclesAvoided: number;
  doubleJumpsCount: number;
}
