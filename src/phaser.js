/**
 * The Phaser this game ships: built from Phaser's source with only what the game uses,
 * instead of its prebuilt bundle (physics, tilemaps, particles, text, video, ...). The
 * bundle is about a third smaller. vite.config.ts points every `import Phaser from 'phaser'`
 * here; TypeScript still types it from the phaser package.
 *
 * Using something new from Phaser starts here. A missing piece fails at runtime, not at
 * build time: `this.add.text is not a function`. A game object needs its class plus its
 * Factory (`scene.add.x`) and Creator (`scene.make.x`): importing those registers them.
 * Plain JS because Phaser's source has no types of its own.
 */
import 'phaser/src/polyfills/requestVideoFrame.js';
import CONST from 'phaser/src/const.js';
import Extend from 'phaser/src/utils/object/Extend.js';

// The core: what phaser/src/phaser-core.js includes.
import Animations from 'phaser/src/animations/index.js';
import BlendModes from 'phaser/src/renderer/BlendModes.js';
import Cache from 'phaser/src/cache/index.js';
import Scene2D from 'phaser/src/cameras/2d/index.js';
import Core from 'phaser/src/core/index.js';
import Class from 'phaser/src/utils/Class.js';
import Data from 'phaser/src/data/index.js';
import Masks from 'phaser/src/display/mask/index.js';
import DOM from 'phaser/src/dom/index.js';
import Events from 'phaser/src/events/index.js';
import FX from 'phaser/src/fx/index.js';
import Game from 'phaser/src/core/Game.js';
import Input from 'phaser/src/input/index.js';
import LoaderPlugin from 'phaser/src/loader/LoaderPlugin.js';
import 'phaser/src/loader/filetypes/ImageFile.js';
import PhaserMath from 'phaser/src/math/index.js';
import Plugins from 'phaser/src/plugins/index.js';
import Renderer from 'phaser/src/renderer/index.js';
import Scale from 'phaser/src/scale/index.js';
import ScaleModes from 'phaser/src/renderer/ScaleModes.js';
import Scene from 'phaser/src/scene/Scene.js';
import Scenes from 'phaser/src/scene/index.js';
import Sound from 'phaser/src/sound/index.js';
import Structs from 'phaser/src/structs/index.js';
import Textures from 'phaser/src/textures/index.js';
import Time from 'phaser/src/time/index.js';
import Tweens from 'phaser/src/tweens/index.js';
import Utils from 'phaser/src/utils/index.js';

// Game objects: the plumbing, then each kind the game creates.
import BuildGameObject from 'phaser/src/gameobjects/BuildGameObject.js';
import Components from 'phaser/src/gameobjects/components/index.js';
import DisplayList from 'phaser/src/gameobjects/DisplayList.js';
import GameObject from 'phaser/src/gameobjects/GameObject.js';
import GameObjectCreator from 'phaser/src/gameobjects/GameObjectCreator.js';
import GameObjectFactory from 'phaser/src/gameobjects/GameObjectFactory.js';
import UpdateList from 'phaser/src/gameobjects/UpdateList.js';

import BitmapText from 'phaser/src/gameobjects/bitmaptext/static/BitmapText.js';
import 'phaser/src/gameobjects/bitmaptext/static/BitmapTextFactory.js';
import 'phaser/src/gameobjects/bitmaptext/static/BitmapTextCreator.js';
import RetroFont from 'phaser/src/gameobjects/bitmaptext/RetroFont.js';
import Container from 'phaser/src/gameobjects/container/Container.js';
import 'phaser/src/gameobjects/container/ContainerFactory.js';
import 'phaser/src/gameobjects/container/ContainerCreator.js';
import Graphics from 'phaser/src/gameobjects/graphics/Graphics.js';
import 'phaser/src/gameobjects/graphics/GraphicsFactory.js';
import 'phaser/src/gameobjects/graphics/GraphicsCreator.js';
import Image from 'phaser/src/gameobjects/image/Image.js';
import 'phaser/src/gameobjects/image/ImageFactory.js';
import 'phaser/src/gameobjects/image/ImageCreator.js';
import Rectangle from 'phaser/src/gameobjects/shape/rectangle/Rectangle.js';
import 'phaser/src/gameobjects/shape/rectangle/RectangleFactory.js';
import Zone from 'phaser/src/gameobjects/zone/Zone.js';
import 'phaser/src/gameobjects/zone/ZoneFactory.js';
import 'phaser/src/gameobjects/zone/ZoneCreator.js';

const Phaser = Extend(false, {
  Animations,
  BlendModes,
  Cache,
  Cameras: { Scene2D },
  Class,
  Core,
  Data,
  Display: { Masks },
  DOM,
  Events,
  FX,
  Game,
  GameObjects: {
    BuildGameObject, Components, DisplayList, GameObject, GameObjectCreator, GameObjectFactory, UpdateList,
    BitmapText, Container, Graphics, Image, Rectangle, RetroFont, Zone,
  },
  Input,
  Loader: { LoaderPlugin },
  Math: PhaserMath,
  Plugins,
  Renderer,
  Scale,
  ScaleModes,
  Scene,
  Scenes,
  Sound,
  Structs,
  Textures,
  Time,
  Tweens,
  Utils,
}, CONST);

export default Phaser;
