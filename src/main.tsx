import './styles.css';
import { Sword1v1Scene } from './scene/sword1v1/scene';
import { SceneController } from './scene/controller';
import { TrainManager } from './train/manager';
import { Sword1v1Train } from './train/sword1v1/train';
import {
    initializeRenderer,
    recorder,
    renderer,
    scene,
    writer
} from './renderer';
import { defineComponent, ref } from 'vue';
import { createApp, Font } from '@motajs/client';
import { InputType, ITrainWorkflow } from './common';
import { excitation, SCENE } from './setup';
import { TrainWorkflow } from './workflow';

const RootComponent = defineComponent(() => {
    const font = new Font('Verdana', 32);
    const recording = ref(false);

    const startRecord = () => {
        if (recording.value) return;
        writer.start();
        main.workflow.start();
        recording.value = false;
    };

    return () => (
        <container loc={[0, 0, 1920, 1080]}>
            <text
                zIndex={10}
                text={recording.value ? '录制中' : '开始录制'}
                cursor="pointer"
                loc={[0, 0]}
                font={font}
                onClick={startRecord}
            />
            <container loc={[0, 0, 1920, 1080]}>{scene.render()}</container>
        </container>
    );
});

class Main {
    readonly scene: SceneController;
    readonly train: TrainManager;
    readonly workflow: ITrainWorkflow;

    constructor() {
        this.scene = new SceneController(scene);
        this.train = new TrainManager(this.scene);
        this.workflow = new TrainWorkflow(this.train, excitation, recorder);
    }

    async initialize() {
        initializeRenderer();
        const scene = this.initializeScene();
        this.initializetrain();
        this.bind();
        createApp(RootComponent).mount(renderer);
        excitation.excite(this.scene);
        excitation.excite(this.train);
        await scene;
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
