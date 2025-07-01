import './styles.css';
import { Sword1v1Scene } from './scene/sword1v1/scene';
import { SceneController } from './scene/controller';
import { TrainManager } from './train/manager';
import { Sword1v1Train } from './train/sword1v1/train';
import { initializeRenderer, renderer, scene } from './renderer';
import { defineComponent } from 'vue';
import { createApp } from '@motajs/client';
import { InputType } from './common';
import { SCENE } from './setup';

const RootComponent = defineComponent(() => {
    return () => (
        <container loc={[0, 0, 1920, 1080]}>{scene.render()}</container>
    );
});

class Main {
    readonly scene: SceneController;
    readonly train: TrainManager;

    constructor() {
        this.scene = new SceneController(scene);
        this.train = new TrainManager(this.scene);
    }

    initialize() {
        initializeRenderer();
        this.initializeScene();
        this.initializetrain();
        this.bind();
        createApp(RootComponent).mount(renderer);
    }

    async initializeScene() {
        this.scene.add(new Sword1v1Scene());
        await this.scene.ready();
        this.scene.changeTo(SCENE);
    }

    initializetrain() {
        this.train.add(new Sword1v1Train(this.train));
        this.train.changeTo(SCENE);
    }

    bind() {
        this.scene.list.forEach(v => {
            const train = this.train.get(v.id);
            if (!train) return;
            v.bindTrainer(train);
        });
    }
}

const main = new Main();
main.initialize();

window.addEventListener('keydown', ev => {
    main.scene.input(InputType.KeyDown, ev);
});
window.addEventListener('keyup', ev => {
    main.scene.input(InputType.KeyUp, ev);
});
