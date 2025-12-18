const BOARD_LEN = 15

const SQUARE_TYPES = [
  "TW","N","DL","N","N","TL","N","DW","N","TL","N","N","DL","N","TW"
]

const MULTIPLIERS = {
  N: { letter: 1, word: 1 },
  DL: { letter: 2, word: 1 },
  TL: { letter: 3, word: 1 },
  DW: { letter: 1, word: 2 },
  TW: { letter: 1, word: 3 }
}

let bag = []
let values = new Map()
let placed = new Map()
let totalScore = 0
let active = true

function setStatus(msg) {
  $("#status").text(msg || "")
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

async function loadPieces() {
  const res = await fetch("data/pieces.json", { cache: "no-store" })
  if (!res.ok) throw new Error("Failed to load pieces.json")
  const json = await res.json()
  const pieces = Array.isArray(json.pieces) ? json.pieces : []
  values.clear()
  bag = []
  for (const p of pieces) {
    const letter = String(p.letter || "").toUpperCase()
    const value = Number(p.value || 0)
    const amount = Number(p.amount || 0)
    if (!letter || !Number.isFinite(value) || !Number.isFinite(amount)) continue
    values.set(letter, value)
    for (let i = 0; i < amount; i++) bag.push(letter)
  }
  values.set("_", 0)
  for (let i = 0; i < 2; i++) bag.push("_")
  shuffle(bag)
}

function tileImgForLetter(letter) {
  if (letter === "_") return "images/tiles/Scrabble_Tile_Blank.jpg"
  return `images/tiles/Scrabble_Tile_${letter}.jpg`
}

function newTileId() {
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function makeTile(letter) {
  const id = newTileId()
  const $img = $(`<img class="tile" draggable="false">`)
  $img.attr("src", tileImgForLetter(letter))
  $img.attr("alt", `Tile ${letter === "_" ? "Blank" : letter}`)
  $img.attr("id", id)
  $img.data("letter", letter)
  $img.data("value", values.get(letter) ?? 0)
  $img.data("home", "rack")
  $img.draggable({
    revert: "invalid",
    containment: "document",
    start: function() { $(this).addClass("dragging") },
    stop: function() { $(this).removeClass("dragging") }
  })
  return $img
}

function buildBoard() {
  const $board = $("#board")
  $board.empty()
  for (let i = 0; i < BOARD_LEN; i++) {
    const $sq = $(`<div class="square" data-index="${i}"></div>`)
    const $img = $(`<img draggable="false" alt="Board square">`)
    $img.attr("src", `images/board/square_${i}.png`)
    $sq.append($img)
    $sq.droppable({
      accept: ".tile",
      tolerance: "intersect",
      drop: function(event, ui) { onDropToSquare($(this), ui.draggable) }
    })
    $board.append($sq)
  }
}

function buildRackDroppable() {
  $("#rack").droppable({
    accept: ".tile",
    tolerance: "touch",
    drop: function(event, ui) { onDropToRack(ui.draggable) }
  })
}

function dealToRack(count) {
  const $rack = $("#rack")
  for (let i = 0; i < count; i++) {
    if (bag.length === 0) break
    const letter = bag.pop()
    $rack.append(makeTile(letter))
  }
}

function snapToSquare($square, $tile) {
  const $container = $square
  const offset = $container.offset()
  const w = $container.width()
  const h = $container.height()
  $tile.css({ position: "absolute", left: offset.left + w/2 - $tile.width()/2, top: offset.top + h/2 - $tile.height()/2 })
}

function snapToRack($tile) {
  $tile.css({ position: "relative", left: "", top: "" })
  $("#rack").append($tile)
}

function currentBoardIndices() {
  return Array.from(placed.keys()).sort((a,b)=>a-b)
}

function isAdjacentPlacementAllowed(targetIndex) {
  if (placed.size === 0) return true
  return placed.has(targetIndex - 1) || placed.has(targetIndex + 1)
}

function onDropToSquare($square, $tile) {
  if (!active) return
  const idx = Number($square.data("index"))
  if (placed.has(idx)) {
    $tile.draggable("option","revert",true)
    return
  }
  if (!isAdjacentPlacementAllowed(idx)) {
    setStatus("Tiles must be placed adjacent to the existing word.")
    $tile.draggable("option","revert",true)
    return
  }

  const letter = $tile.data("letter")
  const value = Number($tile.data("value") || 0)

  placed.set(idx, { letter, value, tileId: $tile.attr("id") })
  $square.addClass("occupied")
  $tile.appendTo("body")
  $tile.data("home", "board")
  $tile.data("boardIndex", idx)
  snapToSquare($square, $tile)
  updateWordScore()
  setStatus("")
}

function onDropToRack($tile) {
  if (!active) return
  const home = $tile.data("home")
  if (home === "board") {
    const idx = Number($tile.data("boardIndex"))
    placed.delete(idx)
    $(`.square[data-index="${idx}"]`).removeClass("occupied")
    $tile.data("home", "rack")
    $tile.data("boardIndex", null)
    snapToRack($tile)
    updateWordScore()
    setStatus("")
    return
  }
  snapToRack($tile)
  setStatus("")
}

function computeWord() {
  if (placed.size === 0) return { word: "", score: 0, spans: [] }
  const idxs = currentBoardIndices()
  const min = idxs[0]
  const max = idxs[idxs.length - 1]
  for (let i = min; i <= max; i++) {
    if (!placed.has(i)) return { word: "", score: 0, spans: [], invalid: true }
  }
  let word = ""
  let sum = 0
  let wordMult = 1
  const spans = []
  for (let i = min; i <= max; i++) {
    const p = placed.get(i)
    const t = SQUARE_TYPES[i] || "N"
    const m = MULTIPLIERS[t] || MULTIPLIERS.N
    word += (p.letter === "_" ? "*" : p.letter)
    sum += p.value * m.letter
    wordMult *= m.word
    spans.push({ index: i, type: t, letter: p.letter })
  }
  return { word, score: sum * wordMult, spans }
}

function updateWordScore() {
  const w = computeWord()
  if (w.invalid) {
    $("#wordScore").text("0")
    setStatus("No gaps allowed inside the word.")
    return
  }
  $("#wordScore").text(String(w.score))
}

function clearBoardTiles() {
  $(".tile").each(function(){
    const home = $(this).data("home")
    if (home === "board") $(this).remove()
  })
  placed.clear()
  $(".square").removeClass("occupied")
  updateWordScore()
}

function refillRackToSeven() {
  const rackCount = $("#rack .tile").length
  const need = Math.max(0, 7 - rackCount)
  dealToRack(need)
}

function newTiles() {
  if (!active) return
  clearBoardTiles()
  $("#rack").empty()
  dealToRack(7)
  updateWordScore()
  setStatus("")
}

function playWord() {
  if (!active) return
  const w = computeWord()
  if (placed.size === 0) {
    setStatus("Place tiles on the board first.")
    return
  }
  if (w.invalid || !w.word) {
    setStatus("Your word has a gap. Fix the placement.")
    return
  }
  totalScore += w.score
  $("#totalScore").text(String(totalScore))
  const tileIds = new Set(Array.from(placed.values()).map(p => p.tileId))
  tileIds.forEach(id => $(`#${id}`).remove())
  clearBoardTiles()
  refillRackToSeven()
  const extra = bag.length === 0 ? " No tiles left in bag." : ""
  setStatus(`Played "${w.word}" for ${w.score} points.${extra}`)
}

async function restart() {
  active = false
  $("#submitWord,#newTiles,#restart").prop("disabled", true)
  try {
    await loadPieces()
    totalScore = 0
    $("#totalScore").text("0")
    $("#wordScore").text("0")
    placed.clear()
    buildBoard()
    buildRackDroppable()
    $("#rack").empty()
    dealToRack(7)
    updateWordScore()
    setStatus("")
  } catch (e) {
    setStatus(String(e && e.message ? e.message : e))
  } finally {
    active = true
    $("#submitWord,#newTiles,#restart").prop("disabled", false)
  }
}

$(async function(){
  buildBoard()
  buildRackDroppable()
  $("#submitWord").on("click", playWord)
  $("#newTiles").on("click", newTiles)
  $("#restart").on("click", restart)
  await restart()
})
