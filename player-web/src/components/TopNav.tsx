import React, { useEffect, useRef, useState } from "react";
import { NAV_ITEMS, type NavItem } from "../app/constants";

type TopNavProps = {
  activePage: string;
  onChangePage: (pageKey: string) => void;
};

function TopNav({ activePage, onChangePage }: TopNavProps) {
  const [pinnedDropdownKey, setPinnedDropdownKey] = useState("");
  const [hoveredDropdownKey, setHoveredDropdownKey] = useState("");
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!navRef.current) return;
      if (navRef.current.contains(event.target as Node)) return;
      setPinnedDropdownKey("");
      setHoveredDropdownKey("");
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinnedDropdownKey("");
      setHoveredDropdownKey("");
    };
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  return (
    <header className="top-nav">
      <div className="brand">生成器V3.3</div>
      <nav className="nav-list" aria-label="Primary Navigation" ref={navRef}>
        {NAV_ITEMS.map((item: NavItem) => {
          const childItems = Array.isArray(item.children) ? item.children : [];
          const hasChildren = childItems.length > 0;
          const isActive = hasChildren ? childItems.some((child) => child.key === activePage) : activePage === item.key;

          if (!hasChildren) {
            return (
              <button
                key={item.key}
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => {
                  onChangePage(item.key);
                  setPinnedDropdownKey("");
                  setHoveredDropdownKey("");
                }}
              >
                {item.label}
              </button>
            );
          }

          const menuId = `nav-dropdown-${item.key}`;
          const isOpen = pinnedDropdownKey === item.key || hoveredDropdownKey === item.key;
          return (
            <div
              key={item.key}
              className={`nav-dropdown${isOpen ? " open" : ""}`}
              onMouseEnter={() => setHoveredDropdownKey(item.key)}
              onMouseLeave={() => setHoveredDropdownKey("")}
            >
              <button
                className={`nav-item nav-dropdown-trigger${isActive ? " active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={menuId}
                onClick={() => setPinnedDropdownKey((prev) => (prev === item.key ? "" : item.key))}
              >
                {item.label}
              </button>
              <div id={menuId} role="menu" className="nav-dropdown-menu">
                {childItems.map((child) => (
                  <button
                    key={child.key}
                    className={`nav-dropdown-item${activePage === child.key ? " active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      onChangePage(child.key);
                      setPinnedDropdownKey("");
                      setHoveredDropdownKey("");
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </header>
  );
}

export default TopNav;
