import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const distanceBetween = (left, right) => {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getAxisValue = (distance, maxDistance, minValue, maxValue) => {
  const value = maxValue - Math.abs((maxValue * distance) / maxDistance);
  return Math.max(minValue, value + minValue);
};

const debounce = (callback, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
};

function TextPressure({
  alpha = false,
  className = "",
  flex = true,
  fontFamily = "Compressa VF",
  fontUrl = "https://res.cloudinary.com/dr6lvwubh/raw/upload/v1529908256/CompressaPRO-GX.woff2",
  italic = true,
  maxFontSize = 96,
  minFontSize = 24,
  scale = false,
  stroke = false,
  strokeColor = "#ffffff",
  text = "sweetheart",
  textColor = "#ffffff",
  textTransform = "none",
  weight = true,
  width = true,
}) {
  const containerRef = useRef(null);
  const titleRef = useRef(null);
  const spansRef = useRef([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const cursorRef = useRef({ x: 0, y: 0 });

  const [fontSize, setFontSize] = useState(minFontSize);
  const [lineHeight, setLineHeight] = useState(1);
  const [scaleY, setScaleY] = useState(1);

  const chars = useMemo(() => text.split(""), [text]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      cursorRef.current.x = event.clientX;
      cursorRef.current.y = event.clientY;
    };
    const handleTouchMove = (event) => {
      const touch = event.touches[0];
      cursorRef.current.x = touch.clientX;
      cursorRef.current.y = touch.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    if (containerRef.current) {
      const { left, top, width: boxWidth, height: boxHeight } =
        containerRef.current.getBoundingClientRect();
      mouseRef.current.x = left + boxWidth / 2;
      mouseRef.current.y = top + boxHeight / 2;
      cursorRef.current.x = mouseRef.current.x;
      cursorRef.current.y = mouseRef.current.y;
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  const setSize = useCallback(() => {
    if (!containerRef.current || !titleRef.current) return;

    const { width: containerWidth, height: containerHeight } =
      containerRef.current.getBoundingClientRect();
    const fittedFontSize = containerWidth / (chars.length * 0.58);
    const nextFontSize = Math.min(Math.max(fittedFontSize, minFontSize), maxFontSize);

    setFontSize(nextFontSize);
    setLineHeight(1);
    setScaleY(1);

    requestAnimationFrame(() => {
      if (!titleRef.current) return;
      const textRect = titleRef.current.getBoundingClientRect();
      if (scale && textRect.height > 0) {
        const yRatio = containerHeight / textRect.height;
        setScaleY(yRatio);
        setLineHeight(yRatio);
      }
    });
  }, [chars.length, minFontSize, scale]);

  useEffect(() => {
    const debouncedSetSize = debounce(setSize, 100);
    debouncedSetSize();
    window.addEventListener("resize", debouncedSetSize);
    return () => window.removeEventListener("resize", debouncedSetSize);
  }, [setSize]);

  useEffect(() => {
    let animationFrameId;

    const animate = () => {
      mouseRef.current.x += (cursorRef.current.x - mouseRef.current.x) / 15;
      mouseRef.current.y += (cursorRef.current.y - mouseRef.current.y) / 15;

      if (titleRef.current) {
        const titleRect = titleRef.current.getBoundingClientRect();
        const maxDistance = titleRect.width / 2;

        spansRef.current.forEach((span) => {
          if (!span) return;

          const rect = span.getBoundingClientRect();
          const charCenter = {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          };
          const distance = distanceBetween(mouseRef.current, charCenter);
          const wdth = width ? Math.floor(getAxisValue(distance, maxDistance, 5, 200)) : 100;
          const wght = weight ? Math.floor(getAxisValue(distance, maxDistance, 100, 900)) : 400;
          const ital = italic ? getAxisValue(distance, maxDistance, 0, 1).toFixed(2) : 0;
          const alphaValue = alpha ? getAxisValue(distance, maxDistance, 0, 1).toFixed(2) : 1;
          const nextSettings = `'wght' ${wght}, 'wdth' ${wdth}, 'ital' ${ital}`;

          if (span.style.fontVariationSettings !== nextSettings) {
            span.style.fontVariationSettings = nextSettings;
          }
          if (alpha && span.style.opacity !== alphaValue) {
            span.style.opacity = alphaValue;
          }
        });
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [alpha, italic, weight, width]);

  const styleElement = useMemo(
    () => (
      <style>{`
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontUrl}');
          font-style: normal;
        }

        .text-pressure-flex {
          display: flex;
          justify-content: space-between;
        }

        .text-pressure-stroke span {
          position: relative;
          color: ${textColor};
        }

        .text-pressure-stroke span::after {
          content: attr(data-char);
          position: absolute;
          left: 0;
          top: 0;
          z-index: -1;
          color: transparent;
          -webkit-text-stroke-width: 3px;
          -webkit-text-stroke-color: ${strokeColor};
        }
      `}</style>
    ),
    [fontFamily, fontUrl, strokeColor, textColor],
  );

  const dynamicClassName = [
    className,
    flex ? "text-pressure-flex" : "",
    stroke ? "text-pressure-stroke" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className="text-pressure-root">
      {styleElement}
      <h1
        ref={titleRef}
        className={`text-pressure-title ${dynamicClassName}`}
        style={{
          color: textColor,
          fontFamily,
          fontSize,
          fontWeight: 100,
          lineHeight,
          margin: 0,
          textAlign: "center",
          textTransform,
          transform: `scale(1, ${scaleY})`,
          transformOrigin: "center top",
          userSelect: "none",
          whiteSpace: "nowrap",
          width: "100%",
        }}
      >
        {chars.map((char, index) => (
          <span
            key={`${char}-${index}`}
            ref={(element) => {
              spansRef.current[index] = element;
            }}
            data-char={char}
            style={{
              color: stroke ? undefined : textColor,
              display: "inline-block",
            }}
          >
            {char}
          </span>
        ))}
      </h1>
    </div>
  );
}

export default TextPressure;
