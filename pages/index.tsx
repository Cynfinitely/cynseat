import Link from "next/link";

const Home: React.FC = () => {
  return (
    <div className="bg-red-100 w-screen h-screen">
      <div className="flex flex-col justify-center items-center w-full h-full">
        <h1 className="text-2xl">Welcome to CynSeat!</h1>
        <p>
          Please <Link href="/signIn">sign in</Link> to continue.
        </p>
      </div>
    </div>
  );
};

export default Home;
