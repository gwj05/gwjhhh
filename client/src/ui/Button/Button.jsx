import React from 'react'

export default function Button({
  variant = 'default', // default/primary/outline/danger/ghost
  size = 'md', // sm/md
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`}
      {...props}
    />
  )
}

