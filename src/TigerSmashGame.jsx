import { useEffect, useRef } from 'react'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 540
const TILE_SIZE = 32
const GROUND_Y = 460

const PLAYER_WIDTH = 42
const PLAYER_HEIGHT = 42
const PLAYER_SPEED = 235
const JUMP_VELOCITY = -510
const GRAVITY = 1600
const TERMINAL_VELOCITY = 850
const ROAR_DURATION = 0.2
const ROAR_COOLDOWN = 0.35

const CROC_SIZE = { w: 42, h: 30 }
const MONKEY_SIZE = { w: 34, h: 34 }
const BOSS_SIZE = { w: 92, h: 76 }

const CHECKPOINT_WIDTH = 22
const GOAL_WIDTH = 24

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function makeRng(seed) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

function aabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

function buildGroundRects(lengthTiles, pits) {
  const rects = []
  let runStart = null

  for (let x = 0; x < lengthTiles; x += 1) {
    const hasGround = !pits.has(x)
    if (hasGround && runStart === null) {
      runStart = x
    }

    if ((!hasGround || x === lengthTiles - 1) && runStart !== null) {
      const runEnd = hasGround && x === lengthTiles - 1 ? x + 1 : x
      rects.push({
        x: runStart * TILE_SIZE,
        y: GROUND_Y,
        w: (runEnd - runStart) * TILE_SIZE,
        h: CANVAS_HEIGHT - GROUND_Y,
      })
      runStart = null
    }
  }

  return rects
}

function createLevel(levelNumber) {
  const isBossLevel = levelNumber % 5 === 0
  const lengthTiles = isBossLevel ? 70 : 120
  const levelWidth = lengthTiles * TILE_SIZE

  const startX = TILE_SIZE * 2
  const checkpointX = Math.floor(lengthTiles * 0.52) * TILE_SIZE
  const goalX = (lengthTiles - 5) * TILE_SIZE

  const rng = makeRng(9001 + levelNumber * 7919)

  const pits = new Set()
  const safeStartTile = 0
  const safeEndTile = 10
  const safeCheckpointStart = Math.floor(checkpointX / TILE_SIZE) - 3
  const safeCheckpointEnd = Math.floor(checkpointX / TILE_SIZE) + 4
  const safeGoalStart = lengthTiles - 10

  let cursor = 12
  while (cursor < lengthTiles - 14) {
    if (rng() < (isBossLevel ? 0.08 : 0.14)) {
      const pitLen = 2 + Math.floor(rng() * (isBossLevel ? 1 : 3))
      for (let i = 0; i < pitLen; i += 1) {
        const tile = cursor + i
        if (
          (tile >= safeStartTile && tile <= safeEndTile) ||
          (tile >= safeCheckpointStart && tile <= safeCheckpointEnd) ||
          tile >= safeGoalStart
        ) {
          continue
        }
        pits.add(tile)
      }
      cursor += pitLen + 4
    } else {
      cursor += 5
    }
  }

  const solids = buildGroundRects(lengthTiles, pits)

  const platforms = []
  if (!isBossLevel) {
    let px = 14
    while (px < lengthTiles - 12) {
      if (rng() < 0.5) {
        const width = 2 + Math.floor(rng() * 4)
        const y = GROUND_Y - (2 + Math.floor(rng() * 4)) * 32
        platforms.push({
          x: px * TILE_SIZE,
          y,
          w: width * TILE_SIZE,
          h: 16,
        })
      }
      px += 9 + Math.floor(rng() * 7)
    }
  }

  const hazards = [...pits].map((tile) => ({
    x: tile * TILE_SIZE,
    y: GROUND_Y,
    w: TILE_SIZE,
    h: CANVAS_HEIGHT - GROUND_Y,
  }))

  const collectibleCount = isBossLevel ? 7 : 16
  const collectibles = Array.from({ length: collectibleCount }, (_, i) => {
    const t = 10 + Math.floor((i + rng() * 3) * ((lengthTiles - 20) / collectibleCount))
    const x = clamp(t * TILE_SIZE, TILE_SIZE * 6, levelWidth - TILE_SIZE * 6)
    const elevated = i % 3 === 0 && !isBossLevel
    return {
      id: `s-${levelNumber}-${i}`,
      x,
      y: elevated ? GROUND_Y - 96 : GROUND_Y - 36,
      w: 24,
      h: 24,
      collected: false,
    }
  })

  const enemies = []
  if (isBossLevel) {
    for (let i = 0; i < 5; i += 1) {
      const x = TILE_SIZE * (8 + i * 8)
      enemies.push({
        id: `m-${levelNumber}-${i}`,
        type: 'monkey',
        x,
        y: GROUND_Y - MONKEY_SIZE.h,
        w: MONKEY_SIZE.w,
        h: MONKEY_SIZE.h,
        minX: x - 60,
        maxX: x + 60,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 70,
        alive: true,
      })
    }
  } else {
    const enemyCount = 12
    for (let i = 0; i < enemyCount; i += 1) {
      const type = rng() < 0.5 ? 'croc' : 'monkey'
      const size = type === 'croc' ? CROC_SIZE : MONKEY_SIZE
      const x = clamp((9 + Math.floor((i + 1) * ((lengthTiles - 18) / enemyCount))) * TILE_SIZE, TILE_SIZE * 8, goalX - 120)
      enemies.push({
        id: `e-${levelNumber}-${i}`,
        type,
        x,
        y: GROUND_Y - size.h,
        w: size.w,
        h: size.h,
        minX: x - 80,
        maxX: x + 80,
        dir: i % 2 === 0 ? 1 : -1,
        speed: type === 'croc' ? 62 : 78,
        alive: true,
      })
    }
  }

  const boss = isBossLevel
    ? {
        x: levelWidth - TILE_SIZE * 11,
        y: GROUND_Y - BOSS_SIZE.h,
        w: BOSS_SIZE.w,
        h: BOSS_SIZE.h,
        minX: levelWidth - TILE_SIZE * 13,
        maxX: levelWidth - TILE_SIZE * 7,
        dir: -1,
        speed: 55,
        maxHp: 8,
        hp: 8,
        alive: true,
      }
    : null

  return {
    number: levelNumber,
    isBossLevel,
    lengthTiles,
    width: levelWidth,
    start: { x: startX, y: GROUND_Y - PLAYER_HEIGHT },
    checkpoint: {
      x: checkpointX,
      y: GROUND_Y - 72,
      w: CHECKPOINT_WIDTH,
      h: 72,
      active: false,
    },
    goal: {
      x: goalX,
      y: GROUND_Y - 90,
      w: GOAL_WIDTH,
      h: 90,
    },
    solids: [...solids, ...platforms],
    hazards,
    collectibles,
    enemies,
    boss,
    initial: {
      collectibles: collectibles.map((item) => ({ ...item })),
      enemies: enemies.map((enemy) => ({ ...enemy })),
      boss: boss ? { ...boss } : null,
    },
  }
}

function resetLevelState(level, keepCheckpoint) {
  level.collectibles = level.initial.collectibles.map((item) => ({ ...item }))
  level.enemies = level.initial.enemies.map((enemy) => ({ ...enemy }))
  level.boss = level.initial.boss ? { ...level.initial.boss } : null
  if (!keepCheckpoint) {
    level.checkpoint.active = false
  }
}

function resolveAxis(entity, solids, axis) {
  for (const solid of solids) {
    if (!aabb(entity, solid)) {
      continue
    }

    if (axis === 'x') {
      if (entity.vx > 0) {
        entity.x = solid.x - entity.w
      } else if (entity.vx < 0) {
        entity.x = solid.x + solid.w
      }
      entity.vx = 0
    } else if (axis === 'y') {
      if (entity.vy > 0) {
        entity.y = solid.y - entity.h
        entity.onGround = true
      } else if (entity.vy < 0) {
        entity.y = solid.y + solid.h
      }
      entity.vy = 0
    }
  }
}

function drawPlayer(ctx, player, tigerImage, imageLoaded) {
  if (imageLoaded && tigerImage) {
    ctx.save()
    if (player.facing === -1) {
      ctx.translate(player.x + player.w, player.y)
      ctx.scale(-1, 1)
      ctx.drawImage(tigerImage, 0, 0, player.w, player.h)
    } else {
      ctx.drawImage(tigerImage, player.x, player.y, player.w, player.h)
    }
    ctx.restore()
    return
  }

  ctx.fillStyle = '#f38a21'
  ctx.fillRect(player.x, player.y, player.w, player.h)
}

function renderGame(ctx, game, tigerImage, imageLoaded) {
  const { level, player, cameraX, sausageCount } = game

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = '#95d9ff'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.save()
  ctx.translate(-cameraX, 0)

  ctx.fillStyle = '#4d9f38'
  for (const solid of level.solids) {
    ctx.fillRect(solid.x, solid.y, solid.w, solid.h)
  }

  ctx.fillStyle = '#c43d2a'
  for (const hazard of level.hazards) {
    ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h)
  }

  ctx.fillStyle = level.checkpoint.active ? '#4bce4b' : '#e7e7e7'
  ctx.fillRect(level.checkpoint.x, level.checkpoint.y, level.checkpoint.w, level.checkpoint.h)
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(level.checkpoint.x - 3, GROUND_Y - 78, 3, 78)

  const goalEnabled = !level.isBossLevel || !level.boss || !level.boss.alive
  ctx.fillStyle = goalEnabled ? '#ffd84d' : '#8f8f8f'
  ctx.fillRect(level.goal.x, level.goal.y, level.goal.w, level.goal.h)
  ctx.fillStyle = '#4a4a4a'
  ctx.fillRect(level.goal.x - 4, GROUND_Y - 96, 4, 96)

  ctx.font = '20px sans-serif'
  ctx.textBaseline = 'top'
  for (const sausage of level.collectibles) {
    if (sausage.collected) {
      continue
    }
    ctx.fillText('🥓', sausage.x, sausage.y)
  }

  for (const enemy of level.enemies) {
    if (!enemy.alive) {
      continue
    }
    ctx.fillStyle = enemy.type === 'croc' ? '#226b27' : '#7836a8'
    ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h)
  }

  if (level.boss && level.boss.alive) {
    ctx.fillStyle = '#2e995d'
    ctx.fillRect(level.boss.x, level.boss.y, level.boss.w, level.boss.h)

    ctx.fillStyle = '#1f2a1f'
    ctx.fillRect(level.boss.x, level.boss.y - 14, level.boss.w, 8)
    ctx.fillStyle = '#d94a4a'
    const hpWidth = (level.boss.w * level.boss.hp) / level.boss.maxHp
    ctx.fillRect(level.boss.x, level.boss.y - 14, hpWidth, 8)
  }

  if (player.roarTimer > 0) {
    const roarBox = {
      x: player.facing === 1 ? player.x + player.w : player.x - 38,
      y: player.y + 6,
      w: 38,
      h: player.h - 10,
    }
    ctx.fillStyle = 'rgba(255, 228, 87, 0.55)'
    ctx.fillRect(roarBox.x, roarBox.y, roarBox.w, roarBox.h)
  }

  drawPlayer(ctx, player, tigerImage, imageLoaded)

  ctx.restore()

  ctx.fillStyle = '#16213d'
  ctx.font = 'bold 24px sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`Level ${level.number}`, 14, 12)
  ctx.fillText(`🥓 x ${sausageCount}`, 14, 42)

  if (level.isBossLevel && level.boss && level.boss.alive) {
    ctx.fillText(`Snake HP: ${level.boss.hp}/${level.boss.maxHp}`, 14, 72)
  }
}

function TigerSmashGame() {
  const canvasRef = useRef(null)
  const tigerImageRef = useRef(null)
  const imageLoadedRef = useRef(false)
  const keysRef = useRef({ left: false, right: false, jumpRequested: false, roarRequested: false })

  const gameRef = useRef({
    level: createLevel(1),
    player: {
      x: TILE_SIZE * 2,
      y: GROUND_Y - PLAYER_HEIGHT,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      roarTimer: 0,
      roarCooldown: 0,
      damageCooldown: 0,
    },
    levelNumber: 1,
    sausageCount: 0,
    cameraX: 0,
  })

  useEffect(() => {
    const tiger = new Image()
    tiger.src = '/tiger.png'
    tiger.onload = () => {
      tigerImageRef.current = tiger
      imageLoadedRef.current = true
    }
    tiger.onerror = () => {
      imageLoadedRef.current = false
    }

    const handleKeyDown = (event) => {
      if (event.code === 'ArrowLeft') keysRef.current.left = true
      if (event.code === 'ArrowRight') keysRef.current.right = true
      if (event.code === 'Space') {
        event.preventDefault()
        keysRef.current.jumpRequested = true
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keysRef.current.roarRequested = true
      }
    }

    const handleKeyUp = (event) => {
      if (event.code === 'ArrowLeft') keysRef.current.left = false
      if (event.code === 'ArrowRight') keysRef.current.right = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return undefined
    }

    function moveToLevel(levelNumber) {
      const level = createLevel(levelNumber)
      const game = gameRef.current
      game.level = level
      game.levelNumber = levelNumber
      game.sausageCount = 0
      game.cameraX = 0
      game.player.x = level.start.x
      game.player.y = level.start.y
      game.player.vx = 0
      game.player.vy = 0
      game.player.onGround = true
      game.player.roarTimer = 0
      game.player.roarCooldown = 0
      game.player.damageCooldown = 0
    }

    function respawnPlayer() {
      const game = gameRef.current
      const { level, player } = game

      const spawnX = level.checkpoint.active ? level.checkpoint.x : level.start.x
      const spawnY = level.start.y
      game.sausageCount = 0
      resetLevelState(level, true)

      player.x = spawnX
      player.y = spawnY
      player.vx = 0
      player.vy = 0
      player.onGround = false
      player.roarTimer = 0
      player.roarCooldown = 0
      player.damageCooldown = 0.25
    }

    function update(dt) {
      const game = gameRef.current
      const { level, player } = game
      const keys = keysRef.current

      const moveInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
      player.vx = moveInput * PLAYER_SPEED
      if (moveInput !== 0) {
        player.facing = moveInput > 0 ? 1 : -1
      }

      if (keys.jumpRequested && player.onGround) {
        player.vy = JUMP_VELOCITY
        player.onGround = false
      }
      keys.jumpRequested = false

      if (keys.roarRequested && player.roarCooldown <= 0) {
        player.roarTimer = ROAR_DURATION
        player.roarCooldown = ROAR_COOLDOWN
      }
      keys.roarRequested = false

      player.roarTimer = Math.max(0, player.roarTimer - dt)
      player.roarCooldown = Math.max(0, player.roarCooldown - dt)
      player.damageCooldown = Math.max(0, player.damageCooldown - dt)

      player.x += player.vx * dt
      resolveAxis(player, level.solids, 'x')

      player.vy = Math.min(TERMINAL_VELOCITY, player.vy + GRAVITY * dt)
      player.onGround = false
      player.y += player.vy * dt
      resolveAxis(player, level.solids, 'y')

      player.x = clamp(player.x, 0, level.width - player.w)

      const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h }
      const roarBox = {
        x: player.facing === 1 ? player.x + player.w : player.x - 38,
        y: player.y + 6,
        w: 38,
        h: player.h - 10,
      }

      if (player.y > CANVAS_HEIGHT + 40) {
        respawnPlayer()
        return
      }

      for (const hazard of level.hazards) {
        if (aabb(playerBox, hazard)) {
          respawnPlayer()
          return
        }
      }

      if (!level.checkpoint.active && aabb(playerBox, level.checkpoint)) {
        level.checkpoint.active = true
      }

      for (const sausage of level.collectibles) {
        if (!sausage.collected && aabb(playerBox, sausage)) {
          sausage.collected = true
          game.sausageCount += 1
        }
      }

      for (const enemy of level.enemies) {
        if (!enemy.alive) {
          continue
        }

        enemy.x += enemy.dir * enemy.speed * dt
        if (enemy.x < enemy.minX) {
          enemy.x = enemy.minX
          enemy.dir = 1
        } else if (enemy.x > enemy.maxX) {
          enemy.x = enemy.maxX
          enemy.dir = -1
        }

        if (!aabb(playerBox, enemy)) {
          continue
        }

        const stomped = player.vy > 60 && player.y + player.h <= enemy.y + 16
        if (enemy.type === 'croc' && stomped) {
          enemy.alive = false
          player.vy = -300
          continue
        }

        const roarHit = player.roarTimer > 0 && aabb(roarBox, enemy)
        if (enemy.type === 'monkey' && roarHit) {
          enemy.alive = false
          continue
        }

        if (player.damageCooldown <= 0) {
          respawnPlayer()
          return
        }
      }

      if (level.boss && level.boss.alive) {
        const boss = level.boss
        boss.x += boss.dir * boss.speed * dt
        if (boss.x < boss.minX) {
          boss.x = boss.minX
          boss.dir = 1
        } else if (boss.x > boss.maxX) {
          boss.x = boss.maxX
          boss.dir = -1
        }

        if (aabb(playerBox, boss)) {
          const stomp = player.vy > 60 && player.y + player.h <= boss.y + 18
          const roar = player.roarTimer > 0 && aabb(roarBox, boss)

          if ((stomp || roar) && player.damageCooldown <= 0) {
            boss.hp -= 1
            player.damageCooldown = 0.25
            if (stomp) {
              player.vy = -340
            }
            if (boss.hp <= 0) {
              boss.alive = false
            }
          } else if (player.damageCooldown <= 0) {
            respawnPlayer()
            return
          }
        }
      }

      const goalActive = !level.isBossLevel || !level.boss || !level.boss.alive
      if (goalActive && aabb(playerBox, level.goal)) {
        moveToLevel(game.levelNumber + 1)
        return
      }

      game.cameraX = clamp(player.x - CANVAS_WIDTH * 0.35, 0, Math.max(0, level.width - CANVAS_WIDTH))
    }

    let animationFrameId = 0
    let previousTimestamp = performance.now()

    const tick = (timestamp) => {
      const dt = Math.min(0.033, (timestamp - previousTimestamp) / 1000)
      previousTimestamp = timestamp

      update(dt)
      renderGame(ctx, gameRef.current, tigerImageRef.current, imageLoadedRef.current)

      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className="game-shell">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-label="Tiger Smash game canvas"
      />
    </div>
  )
}

export default TigerSmashGame
