import { component, h } from 'js-elements'
import { useMousePosition } from 'js-elements/hooks'

const MouseDemo = component('mouse-demo', () => {
  const mousePos = useMousePosition()

  return () => {
    if (!mousePos.isValid()) {
      return <div>Please move mouse ...</div>
    }

    return (
      <div>
        Current mouse position: {mousePos.getX()}x{mousePos.getY()}
      </div>
    )
  }
})

export default MouseDemo
