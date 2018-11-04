import Cryptr from 'cryptr';

export default abstract class Encryption {

    public static key: string = "discord-term";
    public static cryptr: Cryptr = new Cryptr(Encryption.key);

    public static setKey(key: string): void {
        Encryption.key = key;
        Encryption.cryptr = new Cryptr(key);
    }

    public static encrypt(message: string): string {
        return Encryption.cryptr.encrypt(message);   
    }

    public static decrypt(encryptedMessage: string): string {
        return Encryption.cryptr.decrypt(encryptedMessage);
    }
}