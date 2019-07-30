import * as React from 'react'
import { PanGestureHandler, TapGestureHandler, State as GestureState, FlatList } from "react-native-gesture-handler"
import Animated, { Easing } from "react-native-reanimated"

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList)

console.log("STATES", GestureState)

const {
  Value,
  set,
  cond,
  add,
  sub,
  event,
  block,
  debug,
  eq,
  neq,
  and,
  or,
  call,
  interpolate,
  onChange,
  multiply,
  divide,
  greaterThan,
  greaterOrEq,
  lessThan,
  not,
  Clock,
  clockRunning,
  timing,
  startClock,
  stopClock,
  spring,
} = Animated

import {
  StyleSheet,
  VirtualizedListProps,
} from 'react-native'

interface Props<T> extends VirtualizedListProps<T> {
  horizontal: boolean,
  onMoveBegin?: (index: number) => void,
  onMoveEnd?: (params: {
    data: T[],
    from: number,
    to: number,
  }) => void
  renderItem: (params: {
    item: T,
    index: number,
    move: (index: number) => void,
    isActive: boolean,
  }) => React.ComponentType
}

type State = {
  activeRowIndex: number,
  hoverComponent: null | React.ComponentType,
}

class DraggableFlatList<T> extends React.Component<Props<T>, State> {

  state = {
    activeRowIndex: -1,
    toRowIndex: -1,
    hoverComponent: null,
  }

  containerRef = React.createRef()
  flatlistRef = React.createRef()
  containerTapRef = React.createRef()
  containerPanRef = React.createRef()

  containerOffset = new Value(0)

  touchAbsolute = new Value(0)
  touchCellOffset = new Value(0)
  panGestureState = new Value(0)
  tapGestureState = new Value(0)
  cellTapState = new Value(0)
  hasMoved = new Value(0)

  hoverClock = new Clock()
  hoverAnimState = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  }

  hoverAnimConfig = {
    damping: 20,
    mass: 0.2,
    stiffness: 100,
    overshootClamping: false,
    toValue: new Value(0),
    restSpeedThreshold: 0.05,
    restDisplacementThreshold: 0.05,
  }

  activeRowIndex = new Value(-1)
  isHovering = greaterThan(this.activeRowIndex, -1)

  spacerIndex = new Value(-1)
  activeRowSize = new Value(0)

  scrollOffset = new Value(0)
  hoverAnim = sub(this.touchAbsolute, this.touchCellOffset, this.containerOffset)
  hoverMid = add(this.hoverAnim, divide(this.activeRowSize, 2))
  hoverOffset = add(this.hoverAnim, this.scrollOffset)

  cellData = []
  cellAnim = []
  moveEndParams = [this.activeRowIndex, this.spacerIndex]

  setCellData = (data = []) => {
    const { horizontal } = this.props
    data.forEach((_, index) => {
      if (!this.cellAnim[index]) {
        const clock = new Clock()
        const config = {
          toValue: new Value(0),
          duration: 200,
          easing: Easing.ease,
        }

        const state = {
          position: new Value(0),
          frameTime: new Value(0),
          time: new Value(0),
          finished: new Value(0),
        }

        this.cellAnim[index] = { clock, config, state }
      }

      const { clock, config, state } = this.cellAnim[index]

      const runClock = block([
        cond(clockRunning(clock), [
          timing(clock, state, config),
          cond(state.finished, [
            stopClock(clock),
            set(state.frameTime, 0),
            set(state.time, 0),
            set(state.finished, 0),
          ]),
        ]),
        state.position,
      ])

      const offset = new Value(0)
      const size = new Value(0)

      const midpoint = sub(add(offset, divide(size, 2)), this.containerOffset)
      const isAfterActive = greaterThan(index, this.activeRowIndex)

      const hoverMid = cond(
        isAfterActive,
        sub(midpoint, this.activeRowSize),
        midpoint,
      )

      const translate = cond(
        and(
          this.isHovering,
          neq(index, this.activeRowIndex),
        ),
        cond(
          greaterOrEq(hoverMid, this.hoverOffset),
          this.activeRowSize,
          0),
        0,
      )

      const onChangeTranslate = onChange(translate,
        cond(this.isHovering, [
          or(
            cond(and(
              not(isAfterActive),
              greaterThan(translate, 0)
            ),
              set(this.spacerIndex, index)
            ),
            cond(and(
              not(isAfterActive),
              eq(translate, 0),
            ),
              set(this.spacerIndex, index + 1)
            ),
            cond(and(
              isAfterActive,
              eq(translate, 0),
            ),
              set(this.spacerIndex, index),
            ),
            cond(and(
              isAfterActive,
              greaterThan(translate, 0),
            ),
              set(this.spacerIndex, index - 1)
            )
          ),

          set(config.toValue, translate),
          startClock(clock),
        ]),
      )

      const animateTo = cond(isAfterActive, [
        sub(sub(add(offset, size), this.activeRowSize), this.scrollOffset, this.containerOffset)
      ], [
          sub(offset, this.scrollOffset, this.containerOffset)

        ])

      const cellData = {
        ref: React.createRef(),
        offset,
        size,
        measurements: {
          size: 0,
          offset: 0,
        },
        translate: block([
          onChangeTranslate,
          onChange(this.spacerIndex, [
            debug('index change', this.spacerIndex),
            cond(eq(this.spacerIndex, index), [
              set(this.hoverAnimConfig.toValue, animateTo),
            ]),
          ]),
          cond(this.hasMoved, [
            cond(this.isHovering, runClock, 0),
          ], [
              set(state.position, translate),
              translate,
            ])
        ]),
      }

      this.cellData[index] = cellData
    })
  }

  constructor(props) {
    super(props)
    this.setCellData(props.data)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data) {
      this.setCellData(this.props.data)
    }
  }

  move = (hoverComponent, index) => {
    const { onMoveBegin } = this.props
    console.log('setting active row!!', index)

    this.activeRowIndex.setValue(index)
    this.activeRowSize.setValue(this.cellData[index].size)

    this.setState({
      activeRowIndex: index,
      hoverComponent,
    }, () => onMoveBegin && onMoveBegin(index)
    )
  }

  onMoveEnd = ([from, to]) => {
    console.log("JS on move end!!", from, to)
    const { onMoveEnd } = this.props
    if (onMoveEnd) {
      const { data } = this.props
      let newData = data
      if (from !== to) {
        newData = [...data]
        newData.splice(from, 1)
        newData.splice(to, 0, data[from])
      }

      onMoveEnd({
        from,
        to,
        data: newData,
      })
    }
    this.setState({
      activeRowIndex: -1,
      hoverComponent: null,
    })
  }

  measureCell = ([index]: number[]) => {
    const { horizontal } = this.props
    const { activeRowIndex } = this.state
    const { ref } = this.cellData[index]
    if (
      activeRowIndex !== -1 ||
      index === -1 ||
      !(ref.current && ref.current._component)) {
      return
    }

    ref.current._component.measure((x, y, w, h, pageX, pageY) => {
      console.log(`measure index ${index}: wdith ${w} height ${h} pagex ${pageX} pagey ${pageY}`)
      this.cellData[index].size.setValue(horizontal ? w : h)
      this.cellData[index].offset.setValue(horizontal ? pageX : pageY)
      this.cellData[index].measurements.size = h
    })
  }

  renderItem = ({ item, index }) => {
    const { renderItem, horizontal, data } = this.props
    const { activeRowIndex } = this.state
    const isLast = index === data.length - 1
    const cellData = this.cellData[index]
    const { ref, translate } = cellData
    const transform = [{ [`translate${horizontal ? 'X' : 'Y'}`]: translate }]

    console.log('rowsie1!!', activeRowIndex >= 0 && this.cellData[activeRowIndex].measurements.size)

    return (
      <>
        <Animated.View
          onLayout={() => this.measureCell([index])}
          style={{
            transform,
            flex: 1,
            flexDirection: horizontal ? 'row' : 'column',

          }}
        >
          <TapGestureHandler
            simultaneousHandlers={this.containerTapRef}
            onHandlerStateChange={this.onCellTap}
          >
            <Animated.View
              ref={ref}
              style={{
                flex: 1,

              }}
            >
              {activeRowIndex !== index && (
                <RowItem
                  index={index}
                  renderItem={renderItem}
                  item={item}
                  move={this.move}
                />
              )}
            </Animated.View>
          </TapGestureHandler>
        </Animated.View>
        {activeRowIndex >= 0 && isLast && (
          <Animated.View
            style={{
              height: this.cellData[activeRowIndex].measurements.size
            }} />
        )}
      </>
    )
  }

  renderHoverComponent = () => {
    const { hoverComponent } = this.state
    const { horizontal } = this.props

    const resetSpring = [
      set(this.hoverAnimState.time, 0),
      set(this.hoverAnimState.position, this.hoverAnimConfig.toValue),
      set(this.hoverAnimState.finished, 0),
      set(this.hoverAnimState.velocity, 0),
    ]

    const runClock = cond(clockRunning(this.hoverClock), [
      spring(this.hoverClock, this.hoverAnimState, this.hoverAnimConfig),
      cond(eq(this.hoverAnimState.finished, 1), [
        resetSpring,
        stopClock(this.hoverClock),
        call(this.moveEndParams, this.onMoveEnd),
        set(this.hasMoved, 0),
        set(this.activeRowIndex, -1),
        set(this.spacerIndex, -1),
      ]),
      this.hoverAnimState.position
    ])

    return !!hoverComponent && (
      <Animated.View style={[
        styles[`hoverComponent${horizontal ? "Horizontal" : "Vertical"}`],
        {
          transform: [{
            [`translate${horizontal ? "X" : "Y"}`]: block([
              cond(clockRunning(this.hoverClock), [
                runClock,
              ], this.hoverAnim)
            ])
          }]
        }]}
      >
        {hoverComponent}
      </Animated.View>
    )
  }

  keyExtractor = (item, index) => `draggable-flatlist-item-${index}`

  componentDidUpdate = (prevProps: Props) => {
    if (prevProps.extraData !== this.props.extraData) {
      this.setState({ extraData: this.props.extraData })
    }
  }

  onContainerLayout = () => {
    const { horizontal } = this.props
    this.containerRef.current._component.measure((x, y, w, h, pageX, pageY) => {
      console.log('setContaineroOffset', horizontal ? pageX : pageY)
      this.containerOffset.setValue(horizontal ? pageX : pageY)
    })
  }

  onCellTap = event([{
    nativeEvent: ({ state, y, x }) => block([
      cond(
        neq(state, this.cellTapState), [
          cond(eq(state, GestureState.BEGAN), [
            set(this.touchCellOffset, this.props.horizontal ? x : y),
            debug(`touch cell offset`, this.touchCellOffset),
          ]),
          cond(eq(state, GestureState.END), [
            debug('cell touch end', this.cellTapState),
            call(this.moveEndParams, this.onMoveEnd),
            set(this.activeRowIndex, -1),
            set(this.spacerIndex, -1),
            set(this.hasMoved, 0),
          ]),
          set(this.cellTapState, state),
        ]
      ),
    ])
  }])

  onScroll = event([
    {
      nativeEvent: {
        contentOffset: {
          [this.props.horizontal ? "x" : "y"]: this.scrollOffset,
        }
      }
    }
  ])

  onTapStateChange = event([
    {
      nativeEvent: ({ state, absoluteY, absoluteX }) => block([
        cond(
          and(
            eq(state, GestureState.BEGAN),
            neq(this.tapGestureState, GestureState.BEGAN)
          ), [
            set(this.touchAbsolute, this.props.horizontal ? absoluteX : absoluteY),
            debug('container tap begin', this.touchAbsolute),
          ]),
        cond(
          and(
            eq(state, GestureState.FAILED),
            neq(this.tapGestureState, GestureState.FAILED)
          ), [
            debug('container tap fail', this.touchAbsolute),
          ]),
        set(this.tapGestureState, state),
      ])
    }
  ])

  onPanStateChange = event([
    {
      nativeEvent: ({ state }) => block([
        cond(and(
          eq(state, GestureState.END),
          neq(this.panGestureState, GestureState.END),
        ), [
            set(this.hoverAnimState.position, this.hoverAnim),
            startClock(this.hoverClock),
          ]),
        set(this.panGestureState, state),
      ])
    }
  ])

  onPanGestureEvent = event([
    {
      nativeEvent: ({ absoluteY, absoluteX }) => block([
        cond(eq(this.panGestureState, GestureState.ACTIVE), [
          cond(not(this.hasMoved), set(this.hasMoved, 1)),
          set(this.touchAbsolute, this.props.horizontal ? absoluteX : absoluteY),
        ])
      ]),
    },
  ])

  render() {
    const { keyExtractor } = this.props
    const { hoverComponent } = this.state

    return (
      <TapGestureHandler
        ref={this.containerTapRef}
        onHandlerStateChange={this.onTapStateChange}
      >
        <Animated.View style={styles.flex}>
          <PanGestureHandler
            ref={this.containerPanRef}
            onGestureEvent={this.onPanGestureEvent}
            onHandlerStateChange={this.onPanStateChange}
          >
            <Animated.View
              ref={this.containerRef}
              onLayout={this.onContainerLayout}
            >
              <AnimatedFlatList
                {...this.props}
                ref={this.flatlistRef}
                scrollEnabled={!hoverComponent}
                renderItem={this.renderItem}
                extraData={this.state}
                keyExtractor={keyExtractor || this.keyExtractor}
                onScroll={this.onScroll}
                scrollEventThrottle={16}
              />
              {this.renderHoverComponent()}
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </TapGestureHandler>
    )
  }
}

export default DraggableFlatList

DraggableFlatList.defaultProps = {
  scrollPercent: 5,
  scrollSpeed: 5,
  contentContainerStyle: {},
}

type RowItemProps = {
  move: (hoverComponent: React.ComponentType, index: number) => void,
  index: number,
  item: any,
  renderItem: (item: any) => React.ComponentType
}

class RowItem extends React.PureComponent<RowItemProps> {

  move = () => {
    const { move, renderItem, item, index } = this.props
    const hoverComponent = renderItem({
      isActive: true,
      item,
      index,
      move: () => console.log('## attempt to call move on hovering component'),
    })
    move(hoverComponent, index)
  }

  render() {
    const { renderItem, item, index } = this.props
    return renderItem({
      isActive: false,
      item,
      index,
      move: this.move,
    })
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hoverComponentVertical: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hoverComponentHorizontal: {
    position: 'absolute',
    bottom: 0,
    top: 0,
  },
  wrapper: { flex: 1, opacity: 1 },
  fullOpacity: { opacity: 1 }
})