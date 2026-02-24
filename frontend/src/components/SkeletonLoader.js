// frontend/src/components/SkeletonLoader.js
import React from 'react';

export function Skeleton({ width, height, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div className="skeleton-content">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-title" />
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="skeleton-row">
      <div className="skeleton skeleton-avatar" />
      <div className="skeleton-content">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-text" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-table-row">
          <div className="skeleton skeleton-table-cell" />
          <div className="skeleton skeleton-table-cell" />
          <div className="skeleton skeleton-table-cell" />
          <div className="skeleton skeleton-table-cell" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
