import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode
}

interface TooltipTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

interface TooltipContentProps {
  className?: string
  children: React.ReactNode
}

const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>
}

const Tooltip: React.FC<TooltipProps> = ({ children }) => {
  const [isVisible, setIsVisible] = React.useState(false)
  
  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          if (child.type === TooltipTrigger) {
            return React.cloneElement(child as React.ReactElement<any>, { isVisible })
          }
          if (child.type === TooltipContent) {
            return React.cloneElement(child as React.ReactElement<any>, { isVisible })
          }
        }
        return child
      })}
    </div>
  )
}

const TooltipTrigger: React.FC<TooltipTriggerProps & { isVisible?: boolean }> = ({ 
  asChild, 
  children, 
  isVisible 
}) => {
  return <>{children}</>
}

const TooltipContent: React.FC<TooltipContentProps & { isVisible?: boolean }> = ({ 
  className, 
  children, 
  isVisible 
}) => {
  if (!isVisible) return null
  
  return (
    <div
      className={cn(
        "absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 overflow-hidden rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg",
        className
      )}
    >
      {children}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
    </div>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }