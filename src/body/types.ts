export interface IRole {
    /**
     * 添加武器
     * @param weapon 武器对象
     */
    addWeapon(weapon: IRoleWeapon): void;

    /**
     * 添加护甲
     * @param armor 护甲对象
     */
    addArmor(armor: IRoleArmor): void;
}

export interface IRoleWeapon {}

export interface IRoleArmor {}
