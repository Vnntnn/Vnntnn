// Configuration
const PADDING = 15; // Padding around the canvas in pixels

const PADDLE_WIDTH = 75; // Paddle width in pixels
const PADDLE_HEIGHT = 10; // Paddle height in pixels
const PADDLE_RADIUS = 5; // Paddle corner radius in pixels
const PADDLE_BRICK_GAP = 100; // Gap between the last row of bricks and the paddle in pixels

const BALL_RADIUS = 8; // Ball radius in pixels

const BRICK_SIZE = 12; // Brick size in pixels
const BRICK_GAP = 3; // Gap between bricks in pixels
const BRICK_RADIUS = 3; // Radius for rounded corners of bricks

const ANIMATE_STEP = 1; // Step size for animation frames
const SECONDS_PER_FRAME = 1 / 30; // Duration of each frame in seconds (30 FPS)
const MAX_FRAMES = 30000; // Maximum number of frames to simulate
const BALL_SPEED = 10; // Speed of the ball in pixels per frame

// GitHub contribution graph green palettes
const GITHUB_GREENS_DARK = [
  "#151B23",
  "#033A16",
  "#196C2E",
  "#2EA043",
  "#56D364",
];

// Map from light palette color to dark palette color (the GraphQL API returns light colors and does not handle dark mode)
const LIGHT_TO_DARK_COLOR_MAP: Record<string, string> = {
  "#ebedf0": "#151B23",
  "#9be9a8": "#033A16",
  "#40c463": "#196C2E",
  "#30a14e": "#2EA043",
  "#216e39": "#56D364",
};

type BrickStatus = "visible" | "hidden";

// Brick interface
interface Brick {
  x: number; // Brick x position
  y: number; // Brick y position
  status: BrickStatus; // Brick visibility status
  colorClass: string; // CSS class for color
  hasCommit?: boolean; // Indicates if this brick has commit or is empty
}

// One frame of the simulation state
type FrameState = {
  ballX: number; // Ball x position
  ballY: number; // Ball y position
  paddleX: number; // Paddle x position
  bricks: BrickStatus[]; // Array of brick statuses (visible or hidden)
};

/**
 * Fetches the GitHub contributions calendar for a user using the GraphQL API.
 *
 * @param userName - The GitHub username to fetch contributions for.
 * @param githubToken - A GitHub personal access token with appropriate permissions.
 * @returns A 2D array representing weeks and days, where each element contains the color string or null.
 * @throws Will throw an error if the API request fails or returns errors.
 */
async function fetchGithubContributionsGraphQL(
  userName: string,
  githubToken: string,
): Promise<({ color: string; contributionCount: number } | null)[][]> {
  const query = `
    query($userName:String!) {
      user(login: $userName){
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                color
                contributionCount
              }
            }
          }
        }
      }
    }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${githubToken}`,
    },
    body: JSON.stringify({
      query,
      variables: { userName },
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error("GitHub GraphQL error: " + JSON.stringify(json.errors));
  }

  // Format the contribution days into a 2D array of objects (weeks x days)
  const weeks =
    json.data.user.contributionsCollection.contributionCalendar.weeks;
  const colors: ({ color: string; contributionCount: number } | null)[][] = [];
  for (let c = 0; c < weeks.length; c++) {
    colors[c] = [];
    const days = weeks[c].contributionDays;
    for (let r = 0; r < days.length; r++) {
      colors[c][r] = {
        color: days[r].color,
        contributionCount: days[r].contributionCount,
      };
    }
  }
  return colors;
}
/**
 * Checks if a circle and a rectangle are colliding.
 *
 * @param circleX - The x-coordinate of the circle's center.
 * @param circleY - The y-coordinate of the circle's center.
 * @param circleRadius - The radius of the circle.
 * @param rectX - The x-coordinate of the rectangle's top-left corner.
 * @param rectY - The y-coordinate of the rectangle's top-left corner.
 * @param rectWidth - The width of the rectangle.
 * @param rectHeight - The height of the rectangle.
 * @returns True if the circle and rectangle are colliding, false otherwise.
 */
function circleRectCollision(
  circleX: number,
  circleY: number,
  circleRadius: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
): boolean {
  const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
  const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));
  const dx = circleX - closestX;
  const dy = circleY - closestY;
  return dx * dx + dy * dy <= circleRadius * circleRadius;
}

/**
 * Simulates the movement of the ball, paddle, and bricks for a breakout-style game.
 *
 * @param bricks - The initial array of bricks to simulate.
 * @param canvasWidth - The width of the canvas.
 * @param canvasHeight - The height of the canvas.
 * @param paddleY - The vertical position of the paddle.
 * @param enableGhostBricks - If true, only bricks with commits are broken, others remain only visual.
 * @returns An array of frame states representing the simulation history.
 */
function simulate(
  bricks: Brick[],
  canvasWidth: number,
  canvasHeight: number,
  paddleY: number,
  enableGhostBricks: boolean,
): FrameState[] {
  // Initialize ball position at the center bottom of the canvas
  let ballX = canvasWidth / 2;
  let ballY = canvasHeight - 30;

  // Set the initial launch angle and calculate velocity components
  let launchAngle = -Math.PI / 4;
  let ballVelocityX = BALL_SPEED * Math.cos(launchAngle);
  let ballVelocityY = BALL_SPEED * Math.sin(launchAngle);

  // Create a copy of the bricks' array to simulate on
  const simulatedBricks: Brick[] = bricks.map((brick) => ({ ...brick }));

  // Array to store the state of each frame
  const frameHistory: FrameState[] = [];
  let currentFrame = 0;

  // Initialize paddle position at the center
  let paddlePositionX = (canvasWidth - PADDLE_WIDTH) / 2;

  // Main simulation loop
  while (
    simulatedBricks.some(
      (brick) =>
        brick.status === "visible" && (!enableGhostBricks || brick.hasCommit),
    ) &&
    currentFrame < MAX_FRAMES
  ) {
    // Move paddle to follow the ball, clamped within canvas bounds (respect padding)
    paddlePositionX = Math.max(
      PADDING,
      Math.min(canvasWidth - PADDING - PADDLE_WIDTH, ballX - PADDLE_WIDTH / 2),
    );

    // Update ball position
    ballX += ballVelocityX;
    ballY += ballVelocityY;

    // Ball collision with left or right wall (respect padding)
    if (
      ballX + ballVelocityX > canvasWidth - PADDING - BALL_RADIUS ||
      ballX + ballVelocityX < PADDING + BALL_RADIUS
    ) {
      ballVelocityX = -ballVelocityX;
    }

    // Ball collision with top wall (respect padding)
    if (ballY + ballVelocityY < PADDING + BALL_RADIUS) {
      ballVelocityY = -ballVelocityY;
    }

    // Ball collision with paddle
    const ballNextBottom = ballY + ballVelocityY + BALL_RADIUS;
    if (
      ballVelocityY > 0 &&
      ballNextBottom >= paddleY &&
      ballY + BALL_RADIUS <= paddleY // was above paddle
    ) {
      ballVelocityY = -Math.abs(ballVelocityY);
      // Place the ball just at the paddle edge to prevent overlap
      ballY = paddleY - BALL_RADIUS;
    }

    // Ball collision with bricks (updated for "pass through" visual bricks)
    for (let i = 0; i < simulatedBricks.length; i++) {
      const brick = simulatedBricks[i];
      if (
        brick.status === "visible" &&
        (!enableGhostBricks || brick.hasCommit) &&
        circleRectCollision(
          ballX,
          ballY,
          BALL_RADIUS,
          brick.x,
          brick.y,
          BRICK_SIZE,
          BRICK_SIZE,
        )
      ) {
        ballVelocityY = -ballVelocityY;
        brick.status = "hidden";
        break;
      }
    }

    // Prevent the ball from entering the padding on all sides
    ballX = Math.max(
      PADDING + BALL_RADIUS,
      Math.min(canvasWidth - PADDING - BALL_RADIUS, ballX),
    );
    ballY = Math.max(
      PADDING + BALL_RADIUS,
      Math.min(canvasHeight - PADDING - BALL_RADIUS, ballY),
    );

    // Store the frame state at each ANIMATE_STEP interval
    if (currentFrame % ANIMATE_STEP === 0) {
      frameHistory.push({
        ballX: ballX,
        ballY: ballY,
        paddleX: paddlePositionX,
        bricks: simulatedBricks.map((brick) => brick.status),
      });
    }

    currentFrame++;
  }

  // Return the history of all frames
  return frameHistory;
}

/**
 * Converts an array of numbers to a semicolon-separated string with each number formatted to one decimal place.
 * It's used to create the values for SVG animations.
 *
 * @param arr - The array of numbers to format.
 * @returns The formatted string of numbers separated by semicolons.
 */
function getAnimValues(arr: number[]): string {
  return arr.map((v) => v.toFixed(0)).join(";");
}

/**
 * Minifies an SVG string by removing unnecessary whitespace, line breaks, and spaces between tags.
 *
 * @param svg - The SVG string to minify.
 * @returns The minified SVG string.
 */
function minifySVG(svg: string): string {
  return svg
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/\n/g, "");
}

/**
 * Generates a minified SVG string representing a GitHub contributions as a Breakout game animation.
 *
 * @param username - The GitHub username to fetch contributions for.
 * @param githubToken - The GitHub token used for authentication.
 * @param options - Options object (darkMode?: boolean, enableGhostBricks?: boolean)
 * @returns A promise that resolves to the minified SVG string.
 */
export async function generateSVG(
  username: string,
  githubToken: string,
  options: { darkMode?: boolean; enableGhostBricks?: boolean } = {},
): Promise<string> {
  const { darkMode = false, enableGhostBricks = true } = options;
  const colorDays = await fetchGithubContributionsGraphQL(
    username,
    githubToken,
  );

  // The number of columns (weeks) is determined by the API response
  const brickColumnCount = colorDays.length;

  // Calculate canvasWidth and canvasHeight dynamically
  const canvasWidth =
    brickColumnCount * (BRICK_SIZE + BRICK_GAP) + PADDING * 2 - BRICK_GAP; // right edge flush

  // Bricks area height
  const bricksTotalHeight = 7 * (BRICK_SIZE + BRICK_GAP) - BRICK_GAP;

  // Calculate the vertical position of the paddle
  // The paddle sits below the last row of bricks plus the user-specified gap
  const paddleY = PADDING + bricksTotalHeight + PADDLE_BRICK_GAP;

  // Calculate the total canvas height
  // The ball and paddle should have enough space at the bottom (add a little margin)
  const canvasHeight = paddleY + PADDLE_HEIGHT + PADDING;

  // Pick palette and setup color class mapping
  const colorPalette = darkMode
    ? GITHUB_GREENS_DARK
    : Object.keys(LIGHT_TO_DARK_COLOR_MAP);

  // Map each color to a class: c0, c1, ...
  const colorToClass = (color: string) => {
    const idx = colorPalette.findIndex(
      (c) => c.toLowerCase() === color.toLowerCase(),
    );
    return idx !== -1 ? `c${idx}` : "c0";
  };

  // Build bricks with colorClass, skip missing days (null color)
  const bricks: Brick[] = [];
  for (let c = 0; c < brickColumnCount; c++) {
    for (let r = 0; r < 7; r++) {
      const day = (colorDays[c] && colorDays[c][r]) || null;
      if (!day) continue; // skip bricks for missing days

      let dayColor = day.color;
      if (darkMode) {
        dayColor =
          LIGHT_TO_DARK_COLOR_MAP[dayColor.toLowerCase()] ||
          GITHUB_GREENS_DARK[0];
      }
      bricks.push({
        x: c * (BRICK_SIZE + BRICK_GAP) + PADDING,
        y: r * (BRICK_SIZE + BRICK_GAP) + PADDING,
        colorClass: colorToClass(dayColor),
        status: "visible",
        hasCommit: day.contributionCount > 0,
      });
    }
  }

  // Run the simulation
  const states = simulate(
    bricks,
    canvasWidth,
    canvasHeight,
    paddleY,
    enableGhostBricks,
  );
  const animationDuration = states.length * SECONDS_PER_FRAME * ANIMATE_STEP;

  // Extract the X positions of the ball from each state
  const ballX = states.map((s) => s.ballX);
  // Extract the Y positions of the ball from each state
  const ballY = states.map((s) => s.ballY);
  // Extract the X positions of the paddle from each state
  const paddleX = states.map((s) => s.paddleX);

  // Prepare animation data for each brick
  const brickAnimData = bricks.map((b, i) => {
    let firstZero = -1;
    // Only bricks with hasCommit can be hidden
    for (let f = 0; f < states.length; ++f) {
      if (states[f].bricks[i] !== "visible") {
        firstZero = f;
        break;
      }
    }
    if (firstZero === -1) {
      // Brick is always visible
      return { animate: false, opacity: 1, firstZero: -1 };
    } else {
      // Brick disappears/changes at frame firstZero
      const t = firstZero / (states.length - 1);
      // For opacity anim (old)
      const keyTimes = `0;${t.toFixed(4)};${t.toFixed(4)};1`;
      const values = "1;1;0;0";
      return { animate: true, keyTimes, values, firstZero };
    }
  });

  // SVG CSS style for brick color classes
  const style = `<style>${colorPalette
    .map((color, i) => `.c${i}{fill:${color}}`)
    .join("")}</style>`;

  // Brick symbol definition
  const brickSymbol = `<defs>
  <symbol id="brick">
    <rect x="0" y="0" width="${BRICK_SIZE}" height="${BRICK_SIZE}" rx="${BRICK_RADIUS}"/>
  </symbol>
</defs>`;

  // Bricks as individual <use>s (for animating fill)
  const brickUses = bricks
    .map((brick, i) => {
      const anim = brickAnimData[i];
      // For enableGhostBricks=true: switch color to c0 when brick is broken
      if (enableGhostBricks && anim.animate) {
        const t = anim.firstZero / (states.length - 1);
        // Animate fill from original color to c0
        const origColor =
          colorPalette.find((c, idx) => `c${idx}` === brick.colorClass) ||
          colorPalette[0];
        const c0Color = colorPalette[0];
        return `<use href="#brick" x="${brick.x}" y="${brick.y}" fill="${origColor}">
        <animate attributeName="fill" values="${origColor};${origColor};${c0Color};${c0Color}"
          keyTimes="0;${t.toFixed(4)};${t.toFixed(4)};1"
          dur="${animationDuration}s"
          fill="freeze"
          repeatCount="indefinite"/>
      </use>`;
      }
      // For enableGhostBricks=false: hide the brick when broken
      if (anim.animate) {
        return `<use href="#brick" x="${brick.x}" y="${brick.y}" class="${brick.colorClass}">
        <animate attributeName="opacity"
          values="${anim.values}"
          keyTimes="${anim.keyTimes}"
          dur="${animationDuration}s"
          fill="freeze"
          repeatCount="indefinite"/>
      </use>`;
      }
      // Not animating: static brick
      return `<use href="#brick" x="${brick.x}" y="${brick.y}" class="${brick.colorClass}" opacity="1" />`;
    })
    .join("");

  // Paddle is always at same y, so use a transform for y, animate x only
  const paddleRect = `<g transform="translate(0,${paddleY})">
    <rect y="0" width="${PADDLE_WIDTH}" height="${PADDLE_HEIGHT}" rx="${PADDLE_RADIUS}" fill="#1F6FEB">
      <animate attributeName="x" values="${getAnimValues(paddleX)}" dur="${animationDuration}s" repeatCount="indefinite"/>
    </rect>
  </g>`;

  // Ball animate cx/cy
  const ballCircle = `<circle r="${BALL_RADIUS}" fill="#1F6FEB">
    <animate attributeName="cx" values="${getAnimValues(ballX)}" dur="${animationDuration}s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="${getAnimValues(ballY)}" dur="${animationDuration}s" repeatCount="indefinite"/>
  </circle>`;

  const svg = `
<svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
  ${style}
  ${brickSymbol}
  ${brickUses}
  ${paddleRect}
  ${ballCircle}
</svg>
    `.trim();

  // Minify and return the SVG string
  return minifySVG(svg);
}
