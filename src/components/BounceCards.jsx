import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import "./BounceCards.css";

function buildTransforms(count) {
  return Array.from({ length: count }, (_, index) => {
    const rotation = ((index % 2 === 0 ? -1 : 1) * (6 + (index % 3) * 2)).toFixed(1);
    const offsetY = index % 2 === 0 ? 6 : -10;
    return `rotate(${rotation}deg) translateY(${offsetY}px)`;
  });
}

function removeRotation(transform) {
  if (/rotate\([\s\S]*?\)/.test(transform)) {
    return transform.replace(/rotate\([\s\S]*?\)/, "rotate(0deg)");
  }
  return transform === "none" ? "rotate(0deg)" : `${transform} rotate(0deg)`;
}

function pushTransform(baseTransform, offsetX) {
  const match = baseTransform.match(/translate\(([-0-9.]+)px\)/);
  if (!match) {
    return baseTransform === "none" ? `translate(${offsetX}px)` : `${baseTransform} translate(${offsetX}px)`;
  }

  const currentX = Number.parseFloat(match[1]);
  return baseTransform.replace(/translate\(([-0-9.]+)px\)/, `translate(${currentX + offsetX}px)`);
}

function BounceCards({
  animationDelay = 0.15,
  animationStagger = 0.06,
  cards = [],
  className = "",
  containerHeight = 320,
  enableHover = true,
  onDelete,
  onOpen,
  transformStyles,
}) {
  const containerRef = useRef(null);
  const transforms = useMemo(
    () => transformStyles || buildTransforms(cards.length),
    [cards.length, transformStyles],
  );

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        ".bounce-card",
        { opacity: 0, scale: 0, y: 28 },
        {
          delay: animationDelay,
          duration: 0.65,
          ease: "elastic.out(1, 0.72)",
          opacity: 1,
          scale: 1,
          stagger: animationStagger,
          y: 0,
        },
      );
    }, containerRef);

    return () => context.revert();
  }, [animationDelay, animationStagger, cards.length]);

  const moveSiblings = (hoveredIndex) => {
    if (!enableHover || !containerRef.current) return;
    const query = gsap.utils.selector(containerRef);

    cards.forEach((_, index) => {
      const target = query(`.bounce-card-${index}`);
      const baseTransform = transforms[index] || "none";
      const nextTransform =
        index === hoveredIndex
          ? removeRotation(baseTransform)
          : pushTransform(baseTransform, index < hoveredIndex ? -92 : 92);

      gsap.killTweensOf(target);
      gsap.to(target, {
        delay: Math.abs(hoveredIndex - index) * 0.035,
        duration: 0.38,
        ease: "back.out(1.4)",
        overwrite: "auto",
        transform: nextTransform,
      });
    });
  };

  const resetSiblings = () => {
    if (!enableHover || !containerRef.current) return;
    const query = gsap.utils.selector(containerRef);

    cards.forEach((_, index) => {
      const target = query(`.bounce-card-${index}`);
      gsap.killTweensOf(target);
      gsap.to(target, {
        duration: 0.38,
        ease: "back.out(1.4)",
        overwrite: "auto",
        transform: transforms[index] || "none",
      });
    });
  };

  return (
    <div
      ref={containerRef}
      className={`bounce-cards-container ${className}`.trim()}
      style={{ minHeight: containerHeight }}
    >
      {cards.map((card, index) => (
        <figure
          key={card.id || `${card.src}-${index}`}
          className={`bounce-card bounce-card-${index} ${card.isLocalUpload ? "is-local-upload" : ""}`}
          onDoubleClick={() => onOpen?.(card)}
          onMouseEnter={() => moveSiblings(index)}
          onMouseLeave={resetSiblings}
          style={{
            transform: transforms[index] || "none",
            zIndex: index + 1,
          }}
        >
          {card.isLocalUpload && (
            <button
              className="bounce-card-delete"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.(card);
              }}
              title="删除这张本地上传的照片"
              type="button"
            >
              删除
            </button>
          )}
          <img src={card.src} alt={card.alt} />
          <figcaption>
            <strong>{card.caption}</strong>
            <span>{card.takenAt || "待补充"}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default BounceCards;
