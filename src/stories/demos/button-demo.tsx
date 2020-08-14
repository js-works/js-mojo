import { h, prop, stateful, stateless } from '../../main/js-elements'

const buttonDemoStyles = ` 
  .demo-button {
    border: none;
    color: white;
    background-color: black;
    padding: 5px 8px;
    outline: none;
  }

  .demo-button:hover {
    background-color: #444;
  }

  .demo-button:active {
    background-color: #555;
  }
`

const DemoButton = stateful('demo-button', {
  props: {
    text: prop.str.opt(''),
    onButtonClick: prop.func.opt()
  },

  styles: buttonDemoStyles,

  main(c, props) {
    const onClick = () => {
      if (props.onButtonClick) {
        props.onButtonClick(new CustomEvent('button-click')) // TODO
      }
    }

    return () => (
      <button className="demo-button" onClick={onClick}>
        {props.text}
      </button>
    )
  }
})

stateless('button-demo', () => {
  const onClick = (e: any) => alert(e.type) // TODO

  return (
    <div>
      <h3>Button demo</h3>
      <DemoButton onButtonClick={onClick} text="Click me" />
    </div>
  )
})
