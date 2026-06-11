import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Pause, 
  HelpCircle, 
  Trophy, 
  Sparkles,
  Award,
  Zap,
  Flame,
  ArrowUp,
  Smartphone
} from 'lucide-react';
import { 
  GameState, 
  Player, 
  Obstacle, 
  Particle, 
  DecorativeCloud, 
  FloatingLeaf, 
  GameStats,
  ObstacleHeightType
} from '../types';
import { gameAudio } from '../utils/audio';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 320;
const GRAVITY = 0.44;
const JUMP_FORCE = -9.2;
const DOUBLE_JUMP_FORCE = -8.2;
const BASE_SPEED = 4.8;
const PLAYER_X = 120;
const HITBOX_REDUCTION = 5; // Pixels inset for friendly collision handling

export default function GameBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Game states in React for UI overlays
  const [gameState, setGameState] = useState<GameState>('START');
  const [isMuted, setIsMuted] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('edamame_highscore');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [level, setLevel] = useState(1);
  const [obstaclesCleared, setObstaclesCleared] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);

  // Landscape/Mobile scale states
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [isShortScreen, setIsShortScreen] = useState(false);
  const [showPlayTip, setShowPlayTip] = useState(true);

  // References to keep game loop variables running at 60fps without React stale state issues
  const stateRef = useRef<GameState>('START');
  const scoreRef = useRef(0);
  const highScoreRef = useRef(highScore);
  const levelRef = useRef(1);
  const obstaclesClearedRef = useRef(0);
  const isMutedRef = useRef(false);

  // Core physics entities in refs
  const playerRef = useRef<Player>({
    y: GROUND_Y - 44,
    vy: 0,
    width: 32,
    height: 44,
    isGrounded: true,
    jumpCount: 0,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    expression: 'HAPPY',
    trail: []
  });

  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const cloudsRef = useRef<DecorativeCloud[]>([]);
  const leavesRef = useRef<FloatingLeaf[]>([]);
  
  // Custom spawners & trackers
  const framesUntilNextSpawn = useRef(100);
  const consecutiveCountRef = useRef(0);
  const animationFrameId = useRef<number | null>(null);
  const runningTime = useRef(0);
  const lastScoreBeep = useRef(0);

  // Double jump indicator text ref
  const [floatTexts, setFloatTexts] = useState<{ id: string; text: string; x: number; y: number; color: string }[]>([]);

  // Sync state with refs for the fast-paced animation loop
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  // Manage responsive indicators & play tips
  useEffect(() => {
    const handleSizing = () => {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const isVert = window.innerHeight > window.innerWidth;
      
      // If portable touch device and currently in portrait orientation
      setIsPortraitMobile(isTouch && isVert && window.innerWidth < 1024);
      
      // If height is compact (e.g., mobile landscape or small preview)
      setIsShortScreen(window.innerHeight < 540);
    };

    handleSizing();
    window.addEventListener('resize', handleSizing);
    window.addEventListener('orientationchange', handleSizing);
    return () => {
      window.removeEventListener('resize', handleSizing);
      window.removeEventListener('orientationchange', handleSizing);
    };
  }, []);

  // Manage auto-hiding instructions tip during gameplay
  useEffect(() => {
    if (gameState === 'PLAYING') {
      const timer = setTimeout(() => {
        setShowPlayTip(false);
      }, 5000); // Automatically hide guide overlay after 5 seconds
      return () => clearTimeout(timer);
    } else {
      setShowPlayTip(true);
    }
  }, [gameState]);

  // Handle keys & clicks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Stop standard window scrolling
        triggerJump();
      } else if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        pauseGame();
      }
    };
    
    // Global key listener
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  // Initialize atmospheric background decorations
  useEffect(() => {
    // Generate clouds
    const clouds: DecorativeCloud[] = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({
        id: Math.random().toString(),
        x: Math.random() * CANVAS_WIDTH,
        y: 30 + Math.random() * 80,
        scale: 0.6 + Math.random() * 0.8,
        speed: 0.2 + Math.random() * 0.3,
        opacity: 0.4 + Math.random() * 0.4,
      });
    }
    cloudsRef.current = clouds;

    // Generate falling leaves
    const leaves: FloatingLeaf[] = [];
    for (let i = 0; i < 6; i++) {
      leaves.push({
        id: Math.random().toString(),
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * 200,
        speedX: -0.5 - Math.random() * 0.8,
        speedY: 0.4 + Math.random() * 0.6,
        angle: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.05,
        size: 8 + Math.random() * 8,
        color: Math.random() > 0.5 ? '#84cc16' : '#a3e635'
      });
    }
    leavesRef.current = leaves;
  }, []);

  // Responsive scaling to fit containment area
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      
      const container = containerRef.current;
      const canvas = canvasRef.current;
      
      const containerWidth = container.clientWidth;
      const aspect = CANVAS_WIDTH / CANVAS_HEIGHT;
      const targetHeight = containerWidth / aspect;
      
      canvas.style.width = `${containerWidth}px`;
      canvas.style.height = `${targetHeight}px`;
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    
    handleResize();
    return () => observer.disconnect();
  }, []);

  // Start the Core Game loop
  useEffect(() => {
    const render = () => {
      updateGame();
      drawGame();
      animationFrameId.current = requestAnimationFrame(render);
    };

    animationFrameId.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  // Floating text feedback popups
  const spawnFloatText = (text: string, x: number, y: number, color: string = '#84cc16') => {
    const id = Math.random().toString();
    setFloatTexts(prev => [...prev, { id, text, x, y, color }]);
    setTimeout(() => {
      setFloatTexts(prev => prev.filter(t => t.id !== id));
    }, 1200);
  };

  // Sound toggler
  const toggleSound = () => {
    const newMuteState = gameAudio.toggleMute();
    setIsMuted(newMuteState);
    isMutedRef.current = newMuteState;
    if (!newMuteState && stateRef.current === 'PLAYING') {
      gameAudio.startBGM();
    } else {
      gameAudio.stopBGM();
    }
  };

  const triggerJump = () => {
    if (stateRef.current !== 'PLAYING') return;

    const player = playerRef.current;

    if (player.isGrounded) {
      // First jump
      player.vy = JUMP_FORCE;
      player.isGrounded = false;
      player.jumpCount = 1;
      player.scaleX = 0.75;
      player.scaleY = 1.35;
      player.expression = 'JUMPING';
      gameAudio.playJump(false);
      
      // Spawn dust puff particles
      spawnDustParticles(PLAYER_X + player.width / 2, GROUND_Y, 8);
    } else if (player.jumpCount === 1) {
      // Second jump (Double Jump)
      player.vy = DOUBLE_JUMP_FORCE;
      player.jumpCount = 2;
      player.scaleX = 1.25;
      player.scaleY = 0.75;
      player.angle = -Math.PI / 4; // slight flip direction
      player.expression = 'DOUBLE_JUMP';
      gameAudio.playJump(true);

      spawnFloatText('2段ジャンプ！', PLAYER_X, player.y - 20, '#facc15');
      
      // Sparkle green trajectory particles
      spawnSparkles(PLAYER_X + player.width / 2, player.y + player.height / 2, 12, '#86efac');
    }
  };

  // Start the actual gameplay
  const startGame = () => {
    gameAudio.playMenuClick();
    
    // Clear old physics state
    obstaclesRef.current = [];
    particlesRef.current = [];
    scoreRef.current = 0;
    levelRef.current = 1;
    obstaclesClearedRef.current = 0;
    framesUntilNextSpawn.current = 80;
    consecutiveCountRef.current = 0;
    
    setScore(0);
    setLevel(1);
    setObstaclesCleared(0);

    // Initialize player state
    playerRef.current = {
      y: GROUND_Y - 44,
      vy: 0,
      width: 32,
      height: 44,
      isGrounded: true,
      jumpCount: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      expression: 'HAPPY',
      trail: []
    };

    setGameState('PLAYING');
    if (!isMutedRef.current) {
      gameAudio.startBGM();
    }
  };

  const pauseGame = () => {
    gameAudio.playMenuClick();
    if (stateRef.current === 'PLAYING') {
      setGameState('PAUSED');
      gameAudio.stopBGM();
    } else if (stateRef.current === 'PAUSED') {
      setGameState('PLAYING');
      if (!isMutedRef.current) {
        gameAudio.startBGM();
      }
    }
  };

  const returnToTitle = () => {
    gameAudio.playMenuClick();
    setGameState('START');
    gameAudio.stopBGM();
  };

  // Spawn visual elements
  const spawnDustParticles = (x: number, y: number, count: number) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.5) * 2 - 1.2,
        vy: -Math.random() * 1.5 - 0.5,
        color: 'rgba(215, 230, 210, 0.7)',
        radius: 3 + Math.random() * 4,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.02,
        shape: 'circle',
        spin: 0,
        angle: 0
      });
    }
  };

  const spawnSparkles = (x: number, y: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.5) * 5 - 2, // slightly pushed backwards
        vy: (Math.random() - 0.5) * 5 - 1,
        color,
        radius: 2 + Math.random() * 4,
        alpha: 1,
        decay: 0.03 + Math.random() * 0.02,
        shape: Math.random() > 0.4 ? 'star' : 'bean',
        spin: (Math.random() - 0.5) * 0.2,
        angle: Math.random() * Math.PI * 2
      });
    }
  };

  const spawnDizzyBeans = (x: number, y: number, count: number) => {
    const greenColors = ['#4ade80', '#22c55e', '#86efac', '#bbf7d0', '#15803d'];
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 3,
        color: greenColors[Math.floor(Math.random() * greenColors.length)],
        radius: 5 + Math.random() * 6,
        alpha: 1,
        decay: 0.01 + Math.random() * 0.015,
        shape: 'bean',
        spin: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI * 2
      });
    }
  };

  // Spawn an obstacle depending on current level constraints and consecutive rules
  const spawnObstacle = () => {
    // Determine height type
    // LOW = Ground, MID = lower air, HIGH = high air, TALL_VERTICAL = composite tall vertical pod
    const r = Math.random();
    let heightType: ObstacleHeightType = 'LOW';
    if (r < 0.45) {
      heightType = 'LOW';
    } else if (r < 0.67) {
      heightType = 'MID';
    } else if (r < 0.84) {
      heightType = 'HIGH';
    } else {
      heightType = 'TALL_VERTICAL';
    }

    let oHeight = 23;
    let oWidth = 62;
    let oY = GROUND_Y - oHeight; // LOW
    
    if (heightType === 'MID') {
      // Must be safely jumpable with a precise single jump or dual jump
      oY = GROUND_Y - oHeight - 65;
    } else if (heightType === 'HIGH') {
      // Must be high enough to either walk right under OR require a high 2-stage double jump if not walking under!
      // Placing at -105px off the ground allows walking under safely (player standard top is GROUND_Y - 44 = 276).
      // At oY = GROUND_Y - oHeight - 105 = 192 (bottom of pod is 192+23 = 215. Player top at 276 creates 61px vertical gap).
      oY = GROUND_Y - oHeight - 105;
    } else if (heightType === 'TALL_VERTICAL') {
      // さやの向きが縦で、低と中のさやがひとつになった大きさのさや
      // 低の高さ (23) と中の高さ (65 + 23 = 88) がひとつになった高さ、
      // 絶対に２段ジャンプをしないと飛び越えられない高さにするため、高さを92pxに設定。
      oWidth = 24;
      oHeight = 92;
      oY = GROUND_Y - oHeight;
    }

    const currentSpeedMultiplier = 1 + (levelRef.current - 1) * 0.12;
    const scrollSpeed = BASE_SPEED * currentSpeedMultiplier;

    const newObstacle: Obstacle = {
      id: Math.random().toString(),
      x: CANVAS_WIDTH + 60,
      y: oY,
      width: oWidth,
      height: oHeight,
      speed: scrollSpeed + (Math.random() - 0.5) * 0.6, // slight variance
      heightType,
      beanCount: heightType === 'TALL_VERTICAL' ? 3 : (Math.random() > 0.4 ? 3 : 2),
      colorVariation: Math.random() > 0.6 ? '#65a30d' : '#4d7c0f', // deep farm organic greens
      hasPassed: false,
      wiggleOffset: Math.random() * Math.PI
    };

    obstaclesRef.current.push(newObstacle);
  };

  // Run the physics engines
  const updateGame = () => {
    runningTime.current++;

    // 1. UPDATE ATMOSPHERIC BACKGROUND DECORATIONS (Regardless of game state)
    // Cloud system
    cloudsRef.current.forEach(cloud => {
      cloud.x -= cloud.speed;
      if (cloud.x + 150 < 0) {
        cloud.x = CANVAS_WIDTH + 50;
        cloud.y = 30 + Math.random() * 80;
      }
    });

    // Falling leaves
    leavesRef.current.forEach(leaf => {
      leaf.x += leaf.speedX;
      leaf.y += leaf.speedY;
      leaf.angle += leaf.spinSpeed;
      if (leaf.y > CANVAS_HEIGHT + 20 || leaf.x < -20) {
        leaf.y = -20;
        leaf.x = Math.random() * CANVAS_WIDTH + 100;
        leaf.speedX = -0.5 - Math.random() * 0.8;
        leaf.speedY = 0.4 + Math.random() * 0.6;
        leaf.angle = Math.random() * Math.PI * 2;
      }
    });

    // Handle idle transitions or animations during Start screen
    if (stateRef.current === 'START') {
      const player = playerRef.current;
      player.scaleX = 1 + Math.sin(runningTime.current * 0.08) * 0.04;
      player.scaleY = 1 - Math.sin(runningTime.current * 0.08) * 0.04;
      player.angle = Math.sin(runningTime.current * 0.04) * 0.03;
      return;
    }

    if (stateRef.current === 'GAMEOVER' || stateRef.current === 'PAUSED') {
      // Even in gameover, update decaying burst particles for smooth fade-outs
      particlesRef.current.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // secondary gravity
        p.alpha -= p.decay;
        p.angle += p.spin;
      });
      particlesRef.current = particlesRef.current.filter(p => p.alpha > 0);
      return;
    }

    // --- GAMEPLAY IS ACTIVE ---
    const player = playerRef.current;

    // 2. PLAYER PHYSICS
    player.vy += GRAVITY;
    player.y += player.vy;

    // Boundary check with ground
    const actualFloor = GROUND_Y - player.height;
    if (player.y >= actualFloor) {
      player.y = actualFloor;
      player.vy = 0;
      
      // Just landed!
      if (!player.isGrounded) {
        player.isGrounded = true;
        player.jumpCount = 0;
        player.scaleX = 1.28; // high squash rebound
        player.scaleY = 0.72;
        player.expression = 'HAPPY';
        
        // Land particles
        spawnDustParticles(PLAYER_X + player.width / 2, GROUND_Y, 5);
      } else {
        // Continuous running deformation
        player.scaleX += (1 - player.scaleX) * 0.15;
        player.scaleY += (1 - player.scaleY) * 0.15;
        player.angle = Math.sin(runningTime.current * 0.18) * 0.07;
      }
    } else {
      // In-air angle tilting & stretching
      player.isGrounded = false;
      player.scaleX += (1 - player.scaleX) * 0.1;
      player.scaleY += (1 - player.scaleY) * 0.1;

      if (player.vy < 0) {
        // Rising up
        player.angle += (-0.08 - player.angle) * 0.15;
      } else {
        // Falling down
        player.angle += (0.12 - player.angle) * 0.15;
      }
    }

    // Save motion trail for beautiful fast visuals
    player.trail.push({ x: PLAYER_X + player.width / 2, y: player.y + player.height / 2, opacity: 0.65 });
    if (player.trail.length > 8) {
      player.trail.shift();
    }
    player.trail.forEach(t => {
      t.opacity -= 0.08;
    });

    // 3. SPACING & OBSTACLES SPAWNER LOGIC
    // We count frames to spawn, but dynamically adapt frames based on level speed
    // This maintains standard pixel distance between obstacles
    framesUntilNextSpawn.current--;
    if (framesUntilNextSpawn.current <= 0) {
      const currentSpeedMultiplier = 1 + (levelRef.current - 1) * 0.12;
      const scrollSpeed = BASE_SPEED * currentSpeedMultiplier;

      // Roll chance of consecutive flow
      // Limit to max 3 consecutive, 4 or more is strictly impossible
      if (consecutiveCountRef.current < 2 && Math.random() < 0.38) {
        consecutiveCountRef.current++;
        spawnObstacle();

        // High consecutive density needs a healthy minimum gap of 290px so they are 100% manageable!
        // Spacing = frames * speed
        // Frames = Spacing / speed
        const gapPixels = 280 + Math.random() * 60; // 280 to 340 pixels
        framesUntilNextSpawn.current = Math.round(gapPixels / scrollSpeed);
      } else {
        // Normal long spacer
        consecutiveCountRef.current = 0;
        spawnObstacle();

        const gapPixels = 500 + Math.random() * 250; // 500 to 750 pixels spacing
        framesUntilNextSpawn.current = Math.round(gapPixels / scrollSpeed);
      }
    }

    // 4. UPDATE OBSTACLES
    const activeObstacles = obstaclesRef.current;
    for (let i = activeObstacles.length - 1; i >= 0; i--) {
      const obstacle = activeObstacles[i];
      obstacle.x -= obstacle.speed;

      // Passed player scoring checker
      if (!obstacle.hasPassed && obstacle.x + obstacle.width < PLAYER_X) {
        obstacle.hasPassed = true;
        
        // Add Score!
        scoreRef.current += 10;
        obstaclesClearedRef.current += 1;
        
        setScore(scoreRef.current);
        setObstaclesCleared(obstaclesClearedRef.current);

        // Milestone audio beep & sparkle indicator
        if (scoreRef.current % 50 === 0 && scoreRef.current > lastScoreBeep.current) {
          gameAudio.playScoreMilestone();
          lastScoreBeep.current = scoreRef.current;
          spawnFloatText('素晴らしい！ Score +10', CANVAS_WIDTH / 2 - 20, 100, '#eab308');
        } else {
          gameAudio.playMenuClick();
        }

        // LEVEL UP engine (every 8 obstacles)
        const nextLevelGoal = Math.floor(obstaclesClearedRef.current / 8) + 1;
        if (nextLevelGoal > levelRef.current) {
          levelRef.current = nextLevelGoal;
          setLevel(nextLevelGoal);
          spawnFloatText(`LEVEL ${nextLevelGoal}! SPEED UP`, CANVAS_WIDTH / 2 - 30, 130, '#ec4899');
          spawnSparkles(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 20, '#f472b6');
        }

        // Spawn sparkling scores next to player
        spawnSparkles(obstacle.x + obstacle.width / 2, obstacle.y, 6, '#bef264');
      }

      // Despawn offscreen
      if (obstacle.x + obstacle.width + 50 < 0) {
        activeObstacles.splice(i, 1);
        continue;
      }

      // COLLISION DETECTION (Hitbox padding inset for maximum comfort and fairness!)
      const px1 = PLAYER_X + HITBOX_REDUCTION;
      const px2 = PLAYER_X + player.width - HITBOX_REDUCTION;
      const py1 = player.y + HITBOX_REDUCTION;
      const py2 = player.y + player.height - HITBOX_REDUCTION;

      const ox1 = obstacle.x + HITBOX_REDUCTION;
      const ox2 = obstacle.x + obstacle.width - HITBOX_REDUCTION;
      const oy1 = obstacle.y + HITBOX_REDUCTION;
      const oy2 = obstacle.y + obstacle.height - HITBOX_REDUCTION;

      const isColliding = px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1;

      if (isColliding) {
        // Trigger game over!
        gameAudio.playHit();
        gameAudio.stopBGM();
        
        // Trigger particle blowout
        spawnDizzyBeans(PLAYER_X + player.width / 2, player.y + player.height / 2, 25);
        player.expression = 'HIT';
        
        // High score calculation
        if (scoreRef.current > highScoreRef.current) {
          highScoreRef.current = scoreRef.current;
          setHighScore(scoreRef.current);
          localStorage.setItem('edamame_highscore', scoreRef.current.toString());
          spawnFloatText('新記録達成！', PLAYER_X, player.y - 30, '#fbbf24');
        }

        setGameState('GAMEOVER');
        return;
      }
    }

    // 5. PARTICLES ENGINE UPDATE
    particlesRef.current.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      
      // Air drag on sparks
      if (p.shape === 'star' || p.shape === 'bean') {
        p.vx *= 0.98;
        p.vy *= 0.98;
      }
      
      p.alpha -= p.decay;
      p.angle += p.spin;
    });
    // Keep only active particles
    particlesRef.current = particlesRef.current.filter(p => p.alpha > 0);
  };

  // Draw procedures
  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Screen
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. SKY / BACKGROUND GRADIENT
    // High-contrast Japanese rural sky theme
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, '#fefbf3'); // warm eggshell morning cream
    skyGrad.addColorStop(1, '#edf5e1'); // light soft matcha tint
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. PARALLAX DISTANT MOUNTAINS
    ctx.fillStyle = '#daedd2'; // ultra soft green hills
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.quadraticCurveTo(150, 160, 320, GROUND_Y);
    ctx.quadraticCurveTo(450, 190, 600, GROUND_Y);
    ctx.quadraticCurveTo(700, 150, CANVAS_WIDTH, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#bce0b5'; // mid-ground hills
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.quadraticCurveTo(100, 210, 220, GROUND_Y);
    ctx.quadraticCurveTo(340, 230, 480, GROUND_Y);
    ctx.quadraticCurveTo(620, 220, 750, GROUND_Y);
    ctx.quadraticCurveTo(780, 240, CANVAS_WIDTH, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // 3. DRAW CLOUDS (Procedural layered circles for high craft vibes!)
    ctx.fillStyle = '#ffffff';
    cloudsRef.current.forEach(cloud => {
      ctx.globalAlpha = cloud.opacity;
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.arc(15, -10, 22, 0, Math.PI * 2);
      ctx.arc(35, -5, 18, 0, Math.PI * 2);
      ctx.arc(45, 5, 15, 0, Math.PI * 2);
      ctx.rect(0, 5, 45, 15);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      ctx.globalAlpha = 1.0;
    });

    // 4. DRAW FALLING LUSH BIO LEAVES
    leavesRef.current.forEach(leaf => {
      ctx.save();
      ctx.translate(leaf.x, leaf.y);
      ctx.rotate(leaf.angle);
      ctx.fillStyle = leaf.color;
      
      // Simple sharp leaf geometry
      ctx.beginPath();
      ctx.moveTo(0, -leaf.size);
      ctx.quadraticCurveTo(leaf.size / 2, 0, 0, leaf.size);
      ctx.quadraticCurveTo(-leaf.size / 2, 0, 0, -leaf.size);
      ctx.closePath();
      ctx.fill();
      
      // Center leaf line detail
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -leaf.size);
      ctx.lineTo(0, leaf.size);
      ctx.stroke();
      
      ctx.restore();
    });

    // 5. DRAW THE SOLID SOIL GROUND
    // Ground base line
    ctx.fillStyle = '#ebdcc7'; // smooth sandy soil
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    // Grass line decorative
    ctx.strokeStyle = '#65a30d'; // sharp lime grass highlights
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
    ctx.stroke();

    // Procedural moving grass blades on the floor to make running feel extremely dynamic
    const scrollOffset = (runningTime.current * (BASE_SPEED * (1 + (levelRef.current - 1) * 0.12))) % 80;
    ctx.fillStyle = '#4d7c0f';
    for (let x = -40; x < CANVAS_WIDTH + 40; x += 40) {
      const actualX = x - scrollOffset;
      
      // Draw 3 blades of grass
      ctx.beginPath();
      ctx.moveTo(actualX, GROUND_Y);
      ctx.quadraticCurveTo(actualX - 3, GROUND_Y - 10, actualX - 6, GROUND_Y - 14);
      ctx.quadraticCurveTo(actualX - 1, GROUND_Y - 6, actualX + 3, GROUND_Y);
      
      ctx.moveTo(actualX + 5, GROUND_Y);
      ctx.quadraticCurveTo(actualX + 7, GROUND_Y - 15, actualX + 8, GROUND_Y - 18);
      ctx.quadraticCurveTo(actualX + 9, GROUND_Y - 8, actualX + 12, GROUND_Y);

      ctx.moveTo(actualX + 15, GROUND_Y);
      ctx.quadraticCurveTo(actualX + 12, GROUND_Y - 8, actualX + 10, GROUND_Y - 10);
      ctx.quadraticCurveTo(actualX + 13, GROUND_Y - 5, actualX + 17, GROUND_Y);
      ctx.fill();
    }

    // 6. DRAW TRAIL EFFECT FOR JUMP SPEEDS
    const player = playerRef.current;
    if (!player.isGrounded && stateRef.current === 'PLAYING') {
      player.trail.forEach((trailPoint) => {
        ctx.save();
        ctx.globalAlpha = trailPoint.opacity;
        ctx.fillStyle = 'rgba(134, 239, 172, 0.4)'; // translucent lime
        
        ctx.beginPath();
        ctx.ellipse(
          trailPoint.x, 
          trailPoint.y, 
          player.width / 2.2, 
          player.height / 2.2, 
          0, 
          0, 
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      });
      ctx.globalAlpha = 1.0;
    }

    // 7. DRAW OBSTACLES (EDAMAME PODS - さや)
    obstaclesRef.current.forEach(obstacle => {
      ctx.save();
      ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
      
      // Soft hovering wiggle animation to make pods look juicy and alive
      const wiggleAmt = Math.sin(runningTime.current * 0.1 + obstacle.wiggleOffset) * 2;
      ctx.translate(0, wiggleAmt);

      const isVertical = obstacle.heightType === 'TALL_VERTICAL';

      // Draw shadow
      ctx.fillStyle = 'rgba(77, 124, 15, 0.15)';
      ctx.beginPath();
      // Project shadow onto grass floor
      const shadowY = GROUND_Y - (obstacle.y + obstacle.height / 2);
      const shadowRadiusX = isVertical ? obstacle.width * 1.2 : obstacle.width / 1.8;
      ctx.ellipse(0, shadowY, shadowRadiusX, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 縦向きの場合は反時計回りに90度回転させて、常に下から上に伸びているさやのように描画する
      if (isVertical) {
        ctx.rotate(-Math.PI / 2);
      }

      // Pod Styling: A cute, bumpy organic soybean casing (さや)
      ctx.fillStyle = obstacle.colorVariation; 
      ctx.strokeStyle = '#1e3a1a'; // deep boundary ink
      ctx.lineWidth = 2.5;

      // Draw the bumpy pod shape!
      ctx.beginPath();
      const halfW = isVertical ? obstacle.height / 2 : obstacle.width / 2;
      const halfH = isVertical ? obstacle.width / 2 : obstacle.height / 2;

      // Start tail stem (left end)
      ctx.moveTo(-halfW - 5, -3);
      ctx.quadraticCurveTo(-halfW, -7, -halfW + 5, -halfH + 2);

      if (obstacle.beanCount === 3) {
        // 3-bean pod casing bumps
        ctx.bezierCurveTo(-halfW/3, -halfH * 1.6, -halfW/3, -halfH * 1.5, -5, -halfH + 1);
        ctx.bezierCurveTo(halfW/3, -halfH * 1.4, halfW/3, -halfH * 1.6, halfW - 10, -halfH + 4);
        // tip curl right
        ctx.quadraticCurveTo(halfW + 3, -1, halfW + 6, 2);
        ctx.quadraticCurveTo(halfW + 1, halfH - 2, halfW - 8, halfH - 2);
        // bottom bumps back leftwards
        ctx.bezierCurveTo(halfW/3, halfH * 1.5, halfW/3, halfH * 1.4, 0, halfH - 1);
        ctx.bezierCurveTo(-halfW/3, halfH * 1.3, -halfW/3, halfH * 1.6, -halfW + 5, halfH - 3);
      } else {
        // 2-bean pod casing bumps
        ctx.bezierCurveTo(-halfW/2, -halfH * 1.5, -halfW/2, -halfH * 1.6, 0, -halfH + 2);
        ctx.bezierCurveTo(halfW/2, -halfH * 1.4, halfW/2, -halfH * 1.5, halfW - 8, -halfH + 5);
        // tip curl right
        ctx.quadraticCurveTo(halfW + 2, 0, halfW + 5, 2);
        ctx.quadraticCurveTo(halfW, halfH - 1, halfW - 6, halfH - 2);
        // bottom bumps back leftwards
        ctx.bezierCurveTo(halfW/2, halfH * 1.4, halfW/2, halfH * 1.5, -2, halfH - 1);
        ctx.bezierCurveTo(-halfW/2, halfH * 1.5, -halfW/2, halfH * 1.3, -halfW + 6, halfH - 3);
      }
      
      ctx.quadraticCurveTo(-halfW - 4, 3, -halfW - 5, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw bean dividers inside the pod casing (aesthetic curves)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (obstacle.beanCount === 3) {
        // Divider 1
        ctx.moveTo(-halfW / 2.5, -halfH + 4);
        ctx.quadraticCurveTo(-halfW / 2.5 + 4, 0, -halfW / 2.5, halfH - 4);
        // Divider 2
        ctx.moveTo(halfW / 2.5, -halfH + 4);
        ctx.quadraticCurveTo(halfW / 2.5 + 4, 0, halfW / 2.5, halfH - 4);
      } else {
        // Single central divider
        ctx.moveTo(0, -halfH + 4);
        ctx.quadraticCurveTo(5, 0, 0, halfH - 4);
      }
      ctx.stroke();

      // Cute small stem look on the left end
      ctx.strokeStyle = '#2d5a27';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-halfW - 4, -2);
      ctx.quadraticCurveTo(-halfW - 10, -8, -halfW - 14, -6);
      ctx.stroke();

      // Level difficulty indicator: If speed is high, let's draw angry dynamic eyebrows on the pod!
      if (levelRef.current >= 3) {
        ctx.strokeStyle = '#321414';
        ctx.lineWidth = 2;
        // left angry brow
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-2, -2);
        ctx.stroke();
        // right angry brow
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(2, -2);
        ctx.stroke();
      }

      ctx.restore();
    });

    // 8. DRAW ACTIVE PARTICLES
    particlesRef.current.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'bean') {
        // Soy bean shape
        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius * 1.3, p.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // tiny highlighted gleam
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(-p.radius / 3, -p.radius / 3, p.radius * 0.4, p.radius * 0.25, -Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'star') {
        // Cute sparkle star
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          ctx.lineTo(Math.cos((18 + j * 72) * Math.PI / 180) * p.radius, 
                     Math.sin((18 + j * 72) * Math.PI / 180) * p.radius);
          ctx.lineTo(Math.cos((54 + j * 72) * Math.PI / 180) * (p.radius/2), 
                     Math.sin((54 + j * 72) * Math.PI / 180) * (p.radius/2));
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
    ctx.globalAlpha = 1.0;

    // 9. DRAW THE MAIN EDAMAME HERO BEAN
    ctx.save();
    // Center translation around player
    const pCenterY = player.y + player.height / 2;
    ctx.translate(PLAYER_X + player.width / 2, pCenterY);
    ctx.rotate(player.angle);
    ctx.scale(player.scaleX, player.scaleY);

    // Dynamic Shadow based on altitude off ground
    const altitude = GROUND_Y - (player.y + player.height);
    const shadowScale = Math.max(0.3, 1 - altitude / 180);
    ctx.fillStyle = 'rgba(45, 90, 39, 0.16)';
    ctx.beginPath();
    // Shadow coordinates projected on grass
    ctx.ellipse(0, player.height / 2 + altitude, (player.width / 1.7) * shadowScale, 3.5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // BODY: Pure organic oval green bean
    // Dark deep outline
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a3317';
    ctx.fillStyle = '#84cc16'; // premium vibrant soybean green
    ctx.beginPath();
    ctx.ellipse(0, 0, player.width / 2, player.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Body inner gradient highlight for high visual fidelity
    const bodyGrad = ctx.createRadialGradient(-5, -8, 2, 0, 0, player.height / 2);
    bodyGrad.addColorStop(0, '#bef264'); // light tender green
    bodyGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, player.width / 2, player.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // CUTE FACE EXPRESSIONS
    ctx.fillStyle = '#1a3317';
    ctx.strokeStyle = '#1a3317';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    const eyeOffsetX = 6;
    const eyeOffsetY = -5;

    if (player.expression === 'HAPPY') {
      // Normal cute blinking / happy eyes
      ctx.beginPath();
      ctx.arc(-eyeOffsetX, eyeOffsetY, 2.2, 0, Math.PI * 2);
      ctx.arc(eyeOffsetX, eyeOffsetY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Rosy blush cheek circles
      ctx.fillStyle = 'rgba(244, 63, 94, 0.55)'; // strawberry pink
      ctx.beginPath();
      ctx.arc(-eyeOffsetX - 4, eyeOffsetY + 5, 3, 0, Math.PI * 2);
      ctx.arc(eyeOffsetX + 4, eyeOffsetY + 5, 3, 0, Math.PI * 2);
      ctx.fill();

      // Cute open smile mouth
      ctx.fillStyle = '#1a3317';
      ctx.beginPath();
      ctx.arc(0, eyeOffsetY + 3, 3, 0, Math.PI);
      ctx.fill();
    } 
    else if (player.expression === 'JUMPING') {
      // Rising up - sparkling squints
      ctx.beginPath();
      // Left eye squint arc
      ctx.moveTo(-eyeOffsetX - 2, eyeOffsetY - 1);
      ctx.quadraticCurveTo(-eyeOffsetX, eyeOffsetY - 4, -eyeOffsetX + 2, eyeOffsetY - 1);
      // Right eye squint arc
      ctx.moveTo(eyeOffsetX - 2, eyeOffsetY - 1);
      ctx.quadraticCurveTo(eyeOffsetX, eyeOffsetY - 4, eyeOffsetX + 2, eyeOffsetY - 1);
      ctx.stroke();

      // Open gasp mouth "ooh!"
      ctx.fillStyle = '#1a3317';
      ctx.beginPath();
      ctx.arc(0, eyeOffsetY + 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } 
    else if (player.expression === 'DOUBLE_JUMP') {
      // Sparkling stars or determination looks
      ctx.strokeStyle = '#1a3317';
      ctx.lineWidth = 2.5;
      
      // Starry / dynamic eye markings: '>' and '<'
      ctx.beginPath();
      ctx.moveTo(-eyeOffsetX - 2, eyeOffsetY - 2);
      ctx.lineTo(-eyeOffsetX, eyeOffsetY);
      ctx.lineTo(-eyeOffsetX - 2, eyeOffsetY + 2);
      
      ctx.moveTo(eyeOffsetX + 2, eyeOffsetY - 2);
      ctx.lineTo(eyeOffsetX, eyeOffsetY);
      ctx.lineTo(eyeOffsetX + 2, eyeOffsetY + 2);
      ctx.stroke();

      // Happy open laughing curve!
      ctx.fillStyle = '#1a3317';
      ctx.beginPath();
      ctx.arc(0, eyeOffsetY + 4, 4, 0, Math.PI);
      ctx.fill();
    } 
    else if (player.expression === 'HIT') {
      // DIZZY SPIRALING EYES
      const drawSpiral = (cx: number, cy: number) => {
        ctx.beginPath();
        for (let i = 0; i < 30; i++) {
          const theta = i * 0.35;
          const r = theta * 0.45;
          ctx.lineTo(cx + Math.cos(theta) * r, cy + Math.sin(theta) * r);
        }
        ctx.stroke();
      };
      drawSpiral(-eyeOffsetX, eyeOffsetY);
      drawSpiral(eyeOffsetX, eyeOffsetY);

      // Squiggly dizzy line mouth
      ctx.beginPath();
      ctx.moveTo(-4, eyeOffsetY + 7);
      ctx.lineTo(-2, eyeOffsetY + 4);
      ctx.lineTo(0, eyeOffsetY + 7);
      ctx.lineTo(2, eyeOffsetY + 4);
      ctx.lineTo(4, eyeOffsetY + 7);
      ctx.stroke();
    }

    // RUNNING / IDLE LEGS ANIMATION
    ctx.strokeStyle = '#1a3317';
    ctx.lineWidth = 3.5;
    
    // Left & Right stubby legs
    const legLength = 10;
    const bodyHeightHalf = player.height / 2;
    const legSpacing = 6;

    if (player.isGrounded && stateRef.current === 'PLAYING') {
      // Dynamic running scissor cycling legs
      const runCycle = runningTime.current * 0.28;
      const leftLegY = bodyHeightHalf + Math.sin(runCycle) * 3;
      const rightLegY = bodyHeightHalf - Math.sin(runCycle) * 3;
      
      // Draw left leg with small foot
      ctx.beginPath();
      ctx.moveTo(-legSpacing, bodyHeightHalf - 2);
      ctx.lineTo(-legSpacing - 2, leftLegY);
      ctx.lineTo(-legSpacing - 6, leftLegY + 1); // tiny white boot tip
      ctx.stroke();

      // Draw right leg with small foot
      ctx.beginPath();
      ctx.moveTo(legSpacing, bodyHeightHalf - 2);
      ctx.lineTo(legSpacing + 2, rightLegY);
      ctx.lineTo(legSpacing + 6, rightLegY + 1);
      ctx.stroke();
    } else {
      // Free hanging / jumping legs
      // Left leg tucked slightly
      ctx.beginPath();
      ctx.moveTo(-legSpacing, bodyHeightHalf - 2);
      ctx.lineTo(-legSpacing - 1, bodyHeightHalf + 10);
      ctx.lineTo(-legSpacing - 3, bodyHeightHalf + 11);
      ctx.stroke();

      // Right leg trailing nicely
      ctx.beginPath();
      ctx.moveTo(legSpacing, bodyHeightHalf - 2);
      ctx.lineTo(legSpacing + 2, bodyHeightHalf + 8);
      ctx.lineTo(legSpacing + 5, bodyHeightHalf + 9);
      ctx.stroke();
    }

    // CHARMING tiny decorative green stem leaf popping on head!
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(2, -player.height / 2 - 3, 5, 2.8, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  };

  return (
    <div id="game-container-wrapper" className="w-full max-w-4xl mx-auto">
      {/* Main Arcade Frame */}
      <div 
        ref={containerRef} 
        className={`relative w-full aspect-[2/1] overflow-hidden shadow-2xl bg-[#fefbf3] transition-all duration-200 ${
          isShortScreen 
            ? 'rounded-xl border-4 border-[#2D5A27]' 
            : 'rounded-2xl border-[6px] border-[#2D5A27]'
        }`}
        id="canvas-mounting-container"
      >
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          onClick={triggerJump}
          className="block cursor-pointer select-none"
          id="edamame-canvas"
        />

        {/* Floating Sound Toggle on Top-Left */}
        <button 
          onClick={toggleSound}
          className={`absolute bg-[#2D5A27]/85 hover:bg-[#2D5A27] backdrop-blur-xs text-white rounded-lg shadow-md border border-lime-600/30 transition duration-150 flex items-center justify-center cursor-pointer z-10 ${
            isShortScreen ? 'top-2 left-2 p-1.5' : 'top-3 left-3 p-2'
          }`}
          id="btn-floating-sound-toggle"
          title={isMuted ? 'サウンドオン' : '消音'}
        >
          {isMuted ? (
            <VolumeX className={isShortScreen ? 'w-3.5 h-3.5 text-stone-300' : 'w-4 h-4 text-stone-300'} />
          ) : (
            <Volume2 className={isShortScreen ? 'w-3.5 h-3.5 text-lime-200' : 'w-4 h-4 text-lime-200'} />
          )}
        </button>

        {/* Floating Pause Button on Top-Left */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <button 
            onClick={pauseGame}
            className={`absolute bg-[#2D5A27]/85 hover:bg-[#2D5A27] backdrop-blur-xs text-white rounded-lg shadow-md border border-lime-600/30 transition duration-150 flex items-center justify-center cursor-pointer z-10 ${
              isShortScreen ? 'top-2 left-9 p-1.5' : 'top-3 left-13 p-2'
            }`}
            id="btn-floating-pause"
            title={gameState === 'PAUSED' ? '再開する' : '一時停止'}
          >
            {gameState === 'PAUSED' ? (
              <Play className={isShortScreen ? 'w-3.5 h-3.5 text-lime-200 fill-lime-200' : 'w-4 h-4 text-lime-200 fill-lime-200'} />
            ) : (
              <Pause className={isShortScreen ? 'w-3.5 h-3.5 text-lime-200 fill-lime-200' : 'w-4 h-4 text-lime-200 fill-lime-200'} />
            )}
          </button>
        )}

        {/* Play Screen Bottom-Left Pause Tip (Fades out automatically after 5 sec) */}
        <AnimatePresence>
          {gameState === 'PLAYING' && showPlayTip && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className={`absolute left-2.5 bg-[#2D5A27]/90 backdrop-blur-xs text-white font-bold rounded-lg shadow-md border border-lime-600/30 select-none pointer-events-none flex items-center gap-x-2 gap-y-1 max-w-[94%] z-10 ${
                isShortScreen ? 'bottom-2 px-2 py-1 text-[8px]' : 'bottom-3 px-3 py-1.5 text-[10px] lg:text-xs'
              }`}
              id="play-pause-tip"
            >
              {/* If isTouch screen size, render touch instructions, else show keyboard */}
              {window.matchMedia('(pointer: coarse)').matches ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="bg-white text-[#2D5A27] px-1 rounded text-[8px] font-extrabold font-mono">TAP</span>
                    <span>ジャンプ</span>
                  </div>
                  <div className="w-[1px] h-3 bg-lime-600/40"></div>
                  <div className="flex items-center gap-1">
                    <span className="bg-white text-[#2D5A27] px-1 rounded text-[8px] font-extrabold font-mono">DOUBLE TAP</span>
                    <span>2段ジャンプ</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span className="bg-white text-[#2D5A27] px-1 rounded text-[8px] font-extrabold font-mono">P</span>
                    <span>ポーズ</span>
                  </div>
                  <div className="w-[1px] h-3 bg-lime-600/40"></div>
                  <div className="flex items-center gap-1">
                    <span className="bg-white text-[#2D5A27] px-1 rounded text-[8px] font-extrabold font-mono">SPACE</span>
                    <span>ジャンプ</span>
                  </div>
                  <div className="w-[1px] h-3 bg-lime-600/40"></div>
                  <div className="flex items-center gap-1">
                    <span className="bg-white text-[#2D5A27] px-1 rounded text-[8px] font-extrabold font-mono">2段</span>
                    <span>ジャンプ中SPACE / クリック</span>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Play Screen Top-Right HUD Overlay */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <div 
            className={`absolute bg-[#2D5A27]/85 backdrop-blur-xs text-white font-bold rounded-lg shadow-md border border-lime-600/30 select-none pointer-events-none flex items-center z-10 ${
              isShortScreen 
                ? 'top-2 right-2 px-2 py-1 gap-2.5 text-[10px]' 
                : 'top-3 right-3 px-3 py-1.5 gap-3.5 md:gap-4 text-[10px] md:text-xs'
            }`}
            id="play-hud-overlay"
          >
            <div className="flex flex-col items-end">
              <span className="text-[#a3e635] text-[7px] md:text-[9px] font-mono tracking-wider font-extrabold uppercase leading-none mb-0.5">LEVEL</span>
              <span className={`${isShortScreen ? 'text-xs' : 'text-sm md:text-base'} font-extrabold leading-none`}>{level}</span>
            </div>
            <div className={`w-[1px] bg-lime-600/40 ${isShortScreen ? 'h-3.5' : 'h-5 md:h-6'}`}></div>
            <div className="flex flex-col items-end">
              <span className="text-[#a3e635] text-[7px] md:text-[9px] font-mono tracking-wider font-extrabold uppercase leading-none mb-0.5">SCORE</span>
              <span className={`${isShortScreen ? 'text-xs' : 'text-sm md:text-base'} font-extrabold leading-none`}>{score}</span>
            </div>
            <div className={`w-[1px] bg-lime-600/40 ${isShortScreen ? 'h-3.5' : 'h-5 md:h-6'}`}></div>
            <div className="flex flex-col items-end">
              <span className="text-yellow-400 text-[7px] md:text-[9px] font-mono tracking-wider font-extrabold uppercase leading-none mb-0.5">HI-SCORE</span>
              <span className={`${isShortScreen ? 'text-xs' : 'text-sm md:text-base'} font-extrabold text-yellow-300 leading-none`}>{highScore}</span>
            </div>
          </div>
        )}

        {/* CANVAS INTERACTIVE overlays */}
        <AnimatePresence mode="wait">
          {/* 1. START OVERLAY */}
          {gameState === 'START' && (
            <motion.div 
              key="start-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 bg-black/45 backdrop-blur-xs flex flex-col items-center justify-center text-center ${
                isShortScreen ? 'p-2' : 'p-6'
              }`}
              id="game-start-ui"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                className={`bg-[#faf7f2] border-4 border-[#2D5A27] rounded-2xl shadow-xl text-stone-800 transition-all ${
                  isShortScreen ? 'p-4 max-w-lg' : 'p-6 md:p-8 max-w-md'
                }`}
              >
                {!isShortScreen && (
                  <div className="flex justify-center -mt-12 mb-3">
                    <div className="w-16 h-16 bg-[#84cc16] border-4 border-[#2D5A27] rounded-full flex items-center justify-center shadow-lg transform rotate-12">
                       <span className="text-3xl">🌱</span>
                    </div>
                  </div>
                )}

                <h2 className={`font-bold text-[#2d5a27] tracking-normal ${isShortScreen ? 'text-lg mb-1' : 'text-2xl mb-2'}`}>
                  枝豆ジャンプ！
                </h2>
                <p className={`text-stone-600 leading-relaxed ${isShortScreen ? 'text-[11px] mb-3' : 'text-sm mb-6'}`}>
                  タップまたはスペースキーで枝豆をジャンプさせて、流れてくるさやを避けよう！<br />
                  空中でさらにもう一度タップして、<strong>「2段ジャンプ」</strong>が可能です。
                </p>

                <div className={`flex ${isShortScreen ? 'flex-row gap-3 w-full justify-center' : 'flex-col space-y-3'}`}>
                  <button 
                    onClick={startGame}
                    className={`bg-[#84cc16] hover:bg-[#76b813] text-white font-bold rounded-xl border-b-4 border-lime-700 hover:border-lime-800 transition duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                      isShortScreen ? 'py-1.5 px-4 text-xs flex-1' : 'w-full py-3 px-6 text-lg'
                    }`}
                    id="btn-play-game"
                  >
                    <Play className={isShortScreen ? 'w-3.5 h-3.5 fill-white' : 'w-5 h-5 fill-white'} />
                    ゲームスタート
                  </button>

                  <button 
                    onClick={() => {
                      gameAudio.playMenuClick();
                      setShowTutorial(true);
                    }}
                    className={`bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
                      isShortScreen ? 'py-1.5 px-3 text-[11px]' : 'w-full py-2 px-5 text-sm'
                    }`}
                    id="btn-toggle-instructions"
                  >
                    <HelpCircle className={isShortScreen ? 'w-3 h-3' : 'w-4 h-4'} />
                    遊び方
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* 2. GAME OVER OVERLAY */}
          {gameState === 'GAMEOVER' && (
            <motion.div 
              key="gameover-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center ${
                isShortScreen ? 'p-2' : 'p-6'
              }`}
              id="game-over-ui"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className={`bg-white border-4 border-red-600 rounded-2xl shadow-2xl text-stone-800 ${
                  isShortScreen ? 'p-3 max-w-md' : 'p-6 md:p-8 max-w-sm'
                }`}
              >
                {!isShortScreen && (
                  <div className="flex justify-center -mt-12 mb-3">
                    <div className="w-14 h-14 bg-red-100 border-4 border-red-600 rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-2xl">💥</span>
                    </div>
                  </div>
                )}

                <h2 className={`font-black text-red-600 tracking-tight ${isShortScreen ? 'text-lg mb-0.5' : 'text-2xl mb-1'}`}>
                  GAME OVER
                </h2>
                {!isShortScreen && <h3 className="text-xs font-semibold text-stone-500 mb-4 font-mono">さやに当たってしまった！</h3>}

                {/* Compact grid layout overlay table on landscape */}
                <div className={`bg-stone-50 rounded-xl border border-stone-100 mb-4 text-left ${
                  isShortScreen ? 'p-2 py-1.5 flex justify-around items-center gap-2' : 'p-4 space-y-2.5'
                }`}>
                  <div className={`flex items-center ${isShortScreen ? 'flex-col text-center' : 'justify-between w-full'}`}>
                    <span className="text-stone-500 font-semibold flex items-center gap-1 text-[10px] sm:text-xs">
                      <Award className="w-3.5 h-3.5" /> スコア
                    </span>
                    <span className="text-stone-900 font-mono font-bold text-sm sm:text-base">{score}</span>
                  </div>
                  {isShortScreen && <div className="w-[1px] h-6 bg-stone-300"></div>}

                  <div className={`flex items-center ${isShortScreen ? 'flex-col text-center' : 'justify-between w-full'}`}>
                    <span className="text-stone-500 font-semibold flex items-center gap-1 text-[10px] sm:text-xs">
                      <Zap className="w-3.5 h-3.5" /> 回避数
                    </span>
                    <span className="text-stone-900 font-mono font-semibold text-xs sm:text-sm">{obstaclesCleared}</span>
                  </div>
                  {isShortScreen && <div className="w-[1px] h-6 bg-stone-300"></div>}

                  <div className={`flex items-center ${isShortScreen ? 'flex-col text-center' : 'justify-between w-full'}`}>
                    <span className="text-yellow-600 font-bold flex items-center gap-1 text-[10px] sm:text-xs">
                      <Trophy className="w-3.5 h-3.5" /> ベスト
                    </span>
                    <span className="text-yellow-600 font-mono font-extrabold text-sm sm:text-base">{highScore}</span>
                  </div>
                </div>

                <div className={`flex ${isShortScreen ? 'flex-row gap-2.5' : 'flex-col space-y-2.5'}`}>
                  <button 
                    onClick={startGame}
                    className={`w-full bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl border-b-4 border-red-800 hover:border-red-900 transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
                      isShortScreen ? 'py-1.5 px-4 text-xs' : 'py-3 px-6 text-base'
                    }`}
                    id="btn-retry-game"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    もう一度遊ぶ
                  </button>

                  <button 
                    onClick={returnToTitle}
                    className={`w-full bg-[#FAF7F2] hover:bg-stone-50 text-stone-700 font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1 border border-stone-300 cursor-pointer ${
                      isShortScreen ? 'py-1.5 px-3 text-xs' : 'py-2.5 px-5 text-sm'
                    }`}
                    id="btn-quit-gameover"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    タイトル
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* 3. PAUSED OVERLAY */}
          {gameState === 'PAUSED' && (
            <motion.div 
              key="paused-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center ${
                isShortScreen ? 'p-2' : 'p-6'
              }`}
              id="game-paused-ui"
            >
              <div className={`bg-[#FAF7F2] border-4 border-yellow-600 rounded-2xl text-center shadow-2xl w-full mx-auto ${
                isShortScreen ? 'p-4 max-w-sm' : 'p-6 max-w-xs'
              }`}>
                <h3 className={`font-bold text-yellow-700 flex items-center justify-center gap-1.5 ${
                  isShortScreen ? 'text-base mb-1' : 'text-xl mb-2'
                }`}>
                  <Pause className="w-5 h-5 fill-yellow-700" />
                  一時停止中
                </h3>
                {!isShortScreen && (
                  <p className="text-stone-500 font-mono text-[10px] mb-4">
                    [Pキー ]でも一時停止を解除できます
                  </p>
                )}

                <div className={`flex ${isShortScreen ? 'flex-row gap-2' : 'flex-col space-y-2.5'}`}>
                  <button 
                    onClick={pauseGame}
                    className={`w-full bg-[#2D5A27] hover:bg-[#20421c] text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1 cursor-pointer ${
                      isShortScreen ? 'py-1 px-2.5 text-xs' : 'py-2.5 px-4 text-sm'
                    }`}
                    id="btn-resume-overlay"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    再開する
                  </button>

                  <button 
                    onClick={startGame}
                    className={`w-full bg-[#84cc16] hover:bg-[#76b813] text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1 cursor-pointer ${
                      isShortScreen ? 'py-1 px-2.5 text-xs' : 'py-2.5 px-4 text-sm'
                    }`}
                    id="btn-restart-overlay"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    最初から
                  </button>

                  <button 
                    onClick={returnToTitle}
                    className={`w-full bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-xl transition duration-150 flex items-center justify-center gap-1 cursor-pointer ${
                      isShortScreen ? 'py-1 px-2 text-xs' : 'py-2 px-4 text-sm'
                    }`}
                    id="btn-quit-overlay"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    タイトル
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. TUTORIAL OVERLAY */}
          {showTutorial && (
            <motion.div 
              key="tutorial-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 z-20"
              id="game-tutorial-overlay"
            >
              <div 
                className={`bg-[#FAF7F2] border-4 border-[#2D5A27] rounded-xl shadow-2xl text-stone-800 text-xs w-full overflow-y-auto max-h-[96%] ${
                  isShortScreen ? 'p-3 max-w-md' : 'p-4 md:p-5 max-w-sm'
                }`}
              >
                <div className="flex justify-between items-center border-b border-stone-200 pb-1.5 mb-2">
                  <h4 className="font-bold text-[#2D5A27] text-xs sm:text-sm md:text-base flex items-center gap-1">
                    <HelpCircle className="w-4 h-4" />
                    操作方法・ルール
                  </h4>
                  <button 
                    onClick={() => {
                      gameAudio.playMenuClick();
                      setShowTutorial(false);
                    }}
                    className="p-1 hover:bg-stone-200 rounded text-stone-500 cursor-pointer font-bold font-mono text-sm leading-none"
                  >
                    ✕
                  </button>
                </div>
                
                <ul className="list-disc pl-4 space-y-1 text-stone-600 text-[10px] sm:text-xs text-left">
                  <li>
                    <strong>2段ジャンプ:</strong> ジャンプ中に再度画面をタップ（またはスペース）で、もう1段階高くジャンプできます。
                  </li>
                  <li>
                    <strong>障害物の高さ:</strong>
                    <ul className="list-circle pl-4 space-y-0.5 mt-0.5">
                      <li>低：1段ジャンプで避けられます。</li>
                      <li>中：2段ジャンプが必要です。</li>
                      <li>高：ジャンプせずに下を通り抜けます。</li>
                      <li>縦型さや：2段ジャンプが絶対に必要です！</li>
                    </ul>
                  </li>
                  <li>
                    <strong>レベルアップ:</strong> 8個避けるごとにレベルが上がりスピードアップします！
                  </li>
                </ul>
 
                <button 
                  onClick={() => {
                    gameAudio.playMenuClick();
                    setShowTutorial(false);
                  }}
                  className="w-full mt-2.5 bg-[#2D5A27] hover:bg-[#20421c] text-white font-bold py-1.5 rounded-xl text-[11px] sm:text-xs transition duration-150 cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic score popup labels in canvas coords */}
        {floatTexts.map(item => (
          <div
            key={item.id}
            style={{ 
              left: `${(item.x / CANVAS_WIDTH) * 100}%`,
              top: `${(item.y / CANVAS_HEIGHT) * 100}%`,
              transform: 'translate(-50%, -100%)',
              color: item.color,
              textShadow: '0 2px 4px rgba(0,0,0,0.4), 0 0 2px rgba(0,0,0,0.8)'
            }}
            className="absolute font-sans font-extrabold text-[12px] md:text-sm tracking-tight select-none pointer-events-none animate-bounce"
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* 5. PORTRAIT MODE ROTATE LOCK OVERLAY */}
      {isPortraitMobile && (
        <div 
          className="fixed inset-0 bg-[#2D5A27] text-white flex flex-col items-center justify-center p-6 z-50 text-center select-none"
          id="orientation-lock-screen"
        >
          <motion.div 
            animate={{ rotate: [0, -90, -90, 0, 0], scale: [1, 1.05, 1.05, 1, 1] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
            className="w-16 h-16 bg-[#84cc16] rounded-2xl flex items-center justify-center shadow-lg mb-6 border-2 border-lime-300"
          >
            <Smartphone className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-xl font-bold mb-2 tracking-wide flex items-center gap-1 justify-center">
            🌱 画面を横向きにしてください
          </h2>
          <p className="text-xs text-lime-100 max-w-xs leading-relaxed">
            スマートフォンの画面回転ロック（縦向き固定）を解除し、デバイスを横方向に傾けてプレイをお楽しみください！
          </p>
        </div>
      )}
    </div>
  );
}
